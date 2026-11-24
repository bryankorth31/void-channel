// VoidTV PLAY: the controller layout mover on a phone itself. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 24 Nov 2026: "the controller is still the janky one. Please recreate the layout mover I can operate on this
// iPhone so I can choose the correct spacing etc". The editor on the PC (play/tools/layout.html) draws a phone in a
// frame and saves through the local server, so nothing set on a real phone was ever kept. This is the same mover on the
// real pad page, opened on the phone as pad.html?move=1: a handle over each part, moved and sized by a finger, at the
// phone's true size and shape. Save keeps the layout on that phone (src/padlayout.js: it wins over the site's file
// there, so his pad uses it at once) and hands him a short text to send, which play/tools/layout-take.js writes into
// play/layouts.json for every player. Every change is kept as a draft on the phone, so a closed tab loses nothing.
// The rules of moving a part (mirror, snap, hold, rebase) live here for both movers; the PC editor takes them from here.
(function (root) {
  'use strict';
  const L = root.PlayPadLayout || (typeof module === 'object' && module.exports ? require('./padlayout.js') : null);
  const PARTNER = { dpad: 'face', face: 'dpad', l: 'r', r: 'l', select: 'start', start: 'select' };
  // [what it is called, the card that stands for it]: the machines whose buttons the phone pad can be shown with.
  const GAMES = [['Super Nintendo: four buttons, L and R', 'donkey-kong-country-snes'], ['Nintendo: B and A', 'big-birds-hide-and-speak-nes'],
    ['Genesis: A, B and C', 'aladdin-genesis'], ['Game Boy Advance: B, A, L and R', 'curious-george-gba'], ['Atari 2600: one button', 'checkers-2600'],
    ['Arcade: two buttons, Coin, Start', '1941-counter-attack-arcade'], ['PC game: three keys', 'a-j-s-world-of-discovery-1992']];
  const MARK = 'VOIDTV PAD LAYOUT';
  const DRAFT = 'voidtv-pad-layout-draft';

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
    // A round part's drawing sits inside its box, so its box may pass an edge by a little.
    const over = square ? w * L.OVER : 0, lo = over ? -over : 0;
    return { x: Math.max(lo, Math.min(box.x, W - w + over)), y: Math.max(lo, Math.min(box.y, H - h + over)), w, h };
  }
  // Pure (tested): a layout drawn smaller on this screen (it is squarer than the layout fits at full size), made into
  // one that is full size here: every gap and size by that much. Editing starts from what is seen.
  function rebase(set, k) {
    const parts = {};
    for (const [id, e] of Object.entries(set.parts)) parts[id] = { ax: e.ax, ay: e.ay, x: e.x * k, y: e.y * k, w: e.w * k, h: e.h * k };
    return { parts, fit: set.fit };
  }
  // Pure (tested): a box made bigger or smaller by d pixels of width around its own middle, its shape kept.
  function grow(box, d) {
    const f = Math.max(24, box.w + d) / box.w, w = box.w * f, h = box.h * f;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  }
  // Pure (tested): what the phone keeps after a Save of one pad held one way. A layout that is the site's own again
  // (or none at all) is not kept: that phone goes back to what every player has.
  function kept(own, site, pad, way, set) {
    const out = L.clean(own), mine = set ? (L.clean({ [pad]: { [way]: set } })[pad] || {})[way] || null : null;
    const theirs = (L.clean(site)[pad] || {})[way] || null;
    if (!mine || JSON.stringify(mine) === JSON.stringify(theirs)) { if (out[pad]) { delete out[pad][way]; if (!Object.keys(out[pad]).length) delete out[pad]; } }
    else { out[pad] = out[pad] || {}; out[pad][way] = mine; }
    return out;
  }
  // Pure (tested): the text he sends, and that text read back (null: not a layout). Only what clean() lets through.
  const textOf = (own) => { const c = L.clean(own), o = {}; for (const p of L.PADS) if (c[p]) o[p] = c[p]; return MARK + ' ' + JSON.stringify(o); };
  function read(text) {
    const at = String(text || '').indexOf(MARK); if (at < 0) return null;
    const s = String(text).slice(at + MARK.length), a = s.indexOf('{'); if (a < 0) return null;
    // The text may sit in a message with words after it: the layout ends where its first brace closes.
    let depth = 0, end = -1;
    for (let i = a; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}' && --depth === 0) { end = i; break; } }
    if (end < 0) return null;
    let o; try { o = JSON.parse(s.slice(a, end + 1)); } catch (e) { return null; }
    const c = L.clean(o);
    return L.PADS.some((p) => c[p]) ? c : null;
  }
  // Pure (tested): a part's place in words, in pixels on this phone: the gaps to the edges it keeps to, and its size.
  function where(name, box, W, H) {
    const e = L.toEntry(box, W, H), u = Math.min(W, H), n = (v) => Math.round(Math.abs(v) * u);
    const x = e.ax === 'l' ? n(e.x) + ' from left' : e.ax === 'r' ? n(e.x) + ' from right' : (Math.round(e.x * u) ? n(e.x) + (e.x > 0 ? ' right of middle' : ' left of middle') : 'in the middle');
    const y = e.ay === 't' ? n(e.y) + ' from top' : e.ay === 'b' ? n(e.y) + ' from bottom' : (Math.round(e.y * u) ? n(e.y) + (e.y > 0 ? ' below middle' : ' above middle') : 'half way down');
    return name + ': ' + x + ', ' + y + ', ' + Math.round(box.w) + ' by ' + Math.round(box.h);
  }

  const api = { PARTNER, GAMES, MARK, DRAFT, mirror, snap, hold, rebase, grow, kept, textOf, read, where };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayPadMove = api;

  // ---- On the pad page (pad.html?move=1): nothing below runs until the page calls start() ----
  const CSS = '#mv{position:fixed;inset:0;z-index:60;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}'
    + '#mv .h{position:absolute;border:2px dashed rgba(95,212,255,.85);border-radius:8px;touch-action:none}'
    + '#mv .h.round{border-radius:50%}'
    + '#mv .h.sel{border-style:solid;border-color:#ff4fc8;background:rgba(255,79,200,.12)}'
    + '#mv .h.bad{border-color:#ff6b6b;background:rgba(255,107,107,.18)}'
    + '#mv .h b{position:absolute;left:4px;top:4px;font:700 10px system-ui,sans-serif;color:#5fd4ff;background:rgba(7,8,12,.82);border-radius:5px;padding:1px 5px;white-space:nowrap;pointer-events:none}'
    + '#mv .h.round b{left:50%;top:6px;transform:translateX(-50%)}'
    + '#mv .h.sel b{color:#ff4fc8}'
    // The corner dot: a thumb-sized touch area around a small drawn dot.
    + '#mv .h i{position:absolute;right:-19px;bottom:-19px;width:38px;height:38px;border-radius:50%;touch-action:none;z-index:2;background:radial-gradient(circle,#e8e8ee 0 8px,#07080c 8px 11px,transparent 11px)}'
    + '#mv .h.round i{right:calc(14.6% - 19px);bottom:calc(14.6% - 19px)}'
    + '#mv .h.sel i{background:radial-gradient(circle,#ff4fc8 0 8px,#07080c 8px 11px,transparent 11px)}'
    + '#mv .g{position:absolute;background:#f2a93b;pointer-events:none}#mv .g.v{top:0;bottom:0;width:1px}#mv .g.hz{left:0;right:0;height:1px}'
    + '#mv-bar{position:absolute;z-index:5;width:232px;background:rgba(7,8,12,.9);border:1px solid #2a3044;border-radius:14px;padding:6px;box-shadow:0 10px 28px rgba(0,0,0,.6);font:600 12px system-ui,-apple-system,sans-serif;color:#e8e8ee}'
    + '#mv-bar .r{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:5px}'
    + '#mv-bar .t{display:flex;gap:5px;align-items:center}'
    + '#mv-bar button,#mv-bar select{font:600 12px system-ui,-apple-system,sans-serif;color:#e8e8ee;background:#161b2a;border:1px solid #2a3044;border-radius:9px;height:38px;padding:0 2px;min-width:0;touch-action:manipulation}'
    + '#mv-bar button:disabled{opacity:.4}'
    + '#mv-bar #mv-save{background:#ff2d9b;border-color:#ff2d9b;color:#fff}'
    + '#mv-bar #mv-grip{flex:1;height:26px;border-radius:8px;background:#161b2a;border:1px solid #2a3044;display:flex;align-items:center;justify-content:center;color:#9aa0b6;font-size:11px;touch-action:none}'
    + '#mv-bar #mv-fold,#mv-bar #mv-done{width:44px;height:26px;flex:none}'
    + '#mv-bar #mv-game{grid-column:span 2;padding:0 4px}'
    + '#mv-say{margin:6px 2px 1px;min-height:28px;font-weight:500;font-size:11.5px;line-height:1.25;color:#c9cedd}'
    + '#mv-say.bad{color:#ff8f8f}#mv-say.ok{color:#5fe39a}'
    + '#mv-bar.small .x,#mv-bar.small #mv-say{display:none}'
    + '#mv-send{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:rgba(7,8,12,.86);padding:14px}'
    + '#mv-send[hidden]{display:none}'
    + '#mv-send div{width:min(100%,430px);max-height:100%;overflow:auto;background:#0f1118;border:1px solid #2a3044;border-radius:16px;padding:14px;font:500 14px/1.4 system-ui,-apple-system,sans-serif;color:#e8e8ee}'
    + '#mv-send h1{font-size:17px;margin:0 0 6px}#mv-send p{margin:0 0 10px;color:#c9cedd}'
    + '#mv-send textarea{display:block;width:100%;height:84px;box-sizing:border-box;background:#07080c;color:#9aa0b6;border:1px solid #2a3044;border-radius:10px;padding:8px;font:11px ui-monospace,Menlo,Consolas,monospace;resize:none;-webkit-user-select:text;user-select:text}'
    + '#mv-send nav{display:flex;gap:8px;margin-top:10px}'
    + '#mv-send button{flex:1;height:44px;border-radius:11px;border:1px solid #2a3044;background:#161b2a;color:#e8e8ee;font:600 14px system-ui,-apple-system,sans-serif}'
    + '#mv-send button.go{background:#ff2d9b;border-color:#ff2d9b;color:#fff}';

  // o: { door (the pad page's own door: draw, area, parts, show), url (the layouts file), cards (the folder of cards), card (a card as the pad draws it) }
  function start(o) {
    const doc = document, door = o.door, el = (tag, id, text) => { const e = doc.createElement(tag); if (id) e.id = id; if (text) e.textContent = text; return e; };
    const style = el('style'); style.textContent = CSS; doc.head.appendChild(style);
    const over = el('div', 'mv'); doc.body.appendChild(over);
    const st = { site: L.clean(null), works: {}, sel: null, parts: [], area: { x: 0, y: 0, w: innerWidth, h: innerHeight }, game: 0, cards: {}, bar: null, note: null };
    const way = () => (innerWidth >= innerHeight ? 'side' : 'up');
    // The layout being worked on for the way the phone is held now: this phone's own, or else the site's (null: the built-in one).
    function work() {
      const w = way();
      if (!st.works[w]) { const now = L.merge(st.site, L.mine()).phone; st.works[w] = { set: now && now[w] ? JSON.parse(JSON.stringify(now[w])) : null, undo: [], touched: false }; }
      return st.works[w];
    }
    const dirty = () => Object.values(st.works).some((w) => w.touched);
    // Every change is written down on the phone at once: a tab that closes, or a phone that sleeps, loses nothing.
    function draft() {
      const d = {}; for (const [w, k] of Object.entries(st.works)) if (k.touched) d[w] = k.set;
      try { if (Object.keys(d).length) localStorage.setItem(DRAFT, JSON.stringify(d)); else localStorage.removeItem(DRAFT); } catch (e) { /* a browser that keeps nothing */ }
    }
    function sync() {
      const w = work();
      door.show(w.set);
      st.area = door.area(); st.parts = door.parts();
      if (w.set) {
        let added = false;
        for (const p of st.parts) if (!w.set.parts[p.id]) { w.set.parts[p.id] = entry(p.box); added = true; }
        if (added) { door.show(w.set); st.parts = door.parts(); }
      }
      if (st.sel && !st.parts.some((p) => p.id === st.sel)) st.sel = null;
      draw();
      if (st.homed !== way()) { st.homed = way(); if (st.held !== way()) home(); }
    }
    const later = (f) => setTimeout(f, 80);
    function entry(box) {
      const e = L.toEntry(box, st.area.w, st.area.h), k = L.shrink(work().set, st.area.w, st.area.h);
      return k < 1 ? { ax: e.ax, ay: e.ay, x: e.x / k, y: e.y / k, w: e.w / k, h: e.h / k } : e;
    }
    const shape = () => Math.max(st.area.w, st.area.h) / Math.min(st.area.w, st.area.h);
    function refit() { const w = work(); w.set.fit = Math.min(shape(), L.fitOf(w.set.parts, shape(), way() === 'up')); }
    const nameOf = (id) => { const p = st.parts.find((x) => x.id === id); return p ? p.name : id; };
    const words = (b) => (b.kind === 'off' ? nameOf(b.a) + ' is off the screen' : nameOf(b.a) + ' and ' + nameOf(b.b) + ' touch');

    // ---- Drawing: a handle over each part, and the bar's own line ----
    const handles = new Map();
    function draw() {
      const w = work(), a = st.area;
      const bad = w.set ? L.problems(Object.fromEntries(st.parts.map((p) => [p.id, p.box])), a.w, a.h) : [];
      const wrong = new Set(bad.flatMap((b) => [b.a, b.b]).filter(Boolean));
      for (const [id, h] of handles) if (!st.parts.some((p) => p.id === id)) { h.remove(); handles.delete(id); }
      for (const p of st.parts) {
        let h = handles.get(p.id);
        if (!h) {
          h = el('div'); h.dataset.id = p.id; h.appendChild(el('b', null, p.name)); h.appendChild(el('i'));
          over.insertBefore(h, bar); handles.set(p.id, h); grab(h, p.id);
        }
        h.className = 'h' + (p.square ? ' round' : '') + (st.sel === p.id ? ' sel' : '') + (wrong.has(p.id) ? ' bad' : '');
        h.style.left = a.x + p.box.x + 'px'; h.style.top = a.y + p.box.y + 'px'; h.style.width = p.box.w + 'px'; h.style.height = p.box.h + 'px';
      }
      const p = st.parts.find((x) => x.id === st.sel);
      $('mv-undo').disabled = !w.undo.length; $('mv-save').disabled = !dirty();
      $('mv-match').disabled = !p || !PARTNER[p.id] || !st.parts.some((x) => x.id === PARTNER[p.id]);
      for (const id of ['mv-l', 'mv-u', 'mv-d', 'mv-r', 'mv-less', 'mv-more']) $(id).disabled = !p;
      const line = $('mv-say');
      if (st.note) { line.textContent = st.note[0]; line.className = st.note[1] || ''; }
      else if (bad.length) { line.textContent = words(bad[0]) + '.'; line.className = 'bad'; }
      else { line.textContent = p ? where(p.name, p.box, a.w, a.h) : dirty() ? 'Not saved yet.' : 'Drag a part. Drag its dot to size it.'; line.className = ''; }
    }
    function guides(lines) {
      for (const g of [...over.querySelectorAll('.g')]) g.remove();
      for (const l of lines || []) {
        const g = el('div'); g.className = 'g ' + ('v' in l ? 'v' : 'hz');
        if ('v' in l) g.style.left = st.area.x + l.v + 'px'; else g.style.top = st.area.y + l.h + 'px';
        over.insertBefore(g, bar);
      }
    }

    // ---- Changing the layout ----
    // The first change takes the layout in as it stands, every part of it, so nothing jumps.
    function begin() {
      const w = work();
      w.touched = true; st.note = null;
      w.undo.push(JSON.stringify(w.set)); if (w.undo.length > 200) w.undo.shift();
      if (!w.set) { w.set = { parts: {}, fit: 1 }; for (const p of st.parts) w.set.parts[p.id] = L.toEntry(p.box, st.area.w, st.area.h); }
      const k = L.shrink(w.set, st.area.w, st.area.h);
      if (k < 1) { w.set = rebase(w.set, k); w.set.fit = shape(); }
    }
    function put(id, box) {
      const w = work(), p = st.parts.find((x) => x.id === id);
      w.set.parts[id] = L.toEntry(hold(box, st.area.w, st.area.h, p && p.square), st.area.w, st.area.h);
      refit(); sync(); draft();
    }
    function grab(h, id) {
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { h.setPointerCapture(e.pointerId); } catch (x) { /* an old browser: the finger still moves it while over the part */ }
        st.sel = id;
        const p = st.parts.find((x) => x.id === id), b0 = Object.assign({}, p.box), resize = e.target.tagName === 'I';
        const sx = e.clientX, sy = e.clientY;
        let moved = false;
        const move = (m) => {
          const dx = m.clientX - sx, dy = m.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 4) return;
          if (!moved) { moved = true; begin(); }
          let nb, lines = [];
          if (resize) {
            const d = p.square ? Math.max(dx, dy) : 0;
            nb = { x: b0.x, y: b0.y, w: b0.w + (p.square ? d : dx), h: b0.h + (p.square ? d : dy) };
            // A resized part takes its partner's size when it is nearly that already: the two sides then match.
            const mate = st.parts.find((x) => x.id === PARTNER[id]);
            if (mate && Math.abs(nb.w - mate.box.w) <= 6 && Math.abs(nb.h - mate.box.h) <= 6) { nb.w = mate.box.w; nb.h = mate.box.h; }
          } else {
            const s = snap({ x: b0.x + dx, y: b0.y + dy, w: b0.w, h: b0.h }, st.parts.filter((x) => x.id !== id).map((x) => x.box), st.area.w, st.area.h, 6);
            nb = s.box; lines = s.lines;
          }
          put(id, nb); guides(lines);
        };
        const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); guides(); draw(); };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
        draw();
      });
    }
    function change(f) { const p = st.parts.find((x) => x.id === st.sel); if (!p) return; begin(); put(p.id, f(p.box)); }
    const nudge = (dx, dy) => change((b) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
    function undo() { const w = work(); if (!w.undo.length) return; w.set = JSON.parse(w.undo.pop()); w.touched = true; st.note = null; sync(); draft(); }
    function match() {
      const w = work(), mate = PARTNER[st.sel]; if (!mate || !st.parts.some((x) => x.id === mate)) return;
      begin(); w.set.parts[st.sel] = mirror(w.set.parts[mate]); refit(); sync(); draft();
      st.note = [nameOf(st.sel) + ' now matches ' + nameOf(mate) + '. Not saved yet.']; draw();
    }
    // Back to what every player has: the site's layout for this way of holding the phone (none: the built-in one).
    function reset() {
      const w = work(), theirs = st.site.phone && st.site.phone[way()];
      w.undo.push(JSON.stringify(w.set)); w.set = theirs ? JSON.parse(JSON.stringify(theirs)) : null; w.touched = true; st.sel = null;
      st.note = ['Back to the layout every player has. Save to keep it so, or Undo.']; sync(); draft();
    }
    function save() {
      let own = L.mine();
      for (const [w, k] of Object.entries(st.works)) if (k.touched) own = kept(own, st.site, 'phone', w, k.set ? { parts: k.set.parts, fit: k.set.fit } : null);
      if (!L.keep(own)) { st.note = ['Not saved: this browser keeps nothing (private browsing?). Copy the text instead.', 'bad']; send(own, false); draw(); return; }
      for (const k of Object.values(st.works)) k.touched = false;
      draft();
      const any = L.PADS.some((p) => own[p]);
      st.note = [any ? 'Saved on this phone. Your pad uses it now.' : 'Saved: this phone is back on the layout every player has.', 'ok'];
      draw(); if (any) send(own, true);
    }
    // The text to send, with Copy and (where the phone has one) its own Share sheet.
    function send(own, saved) {
      const box = $('mv-send'), text = textOf(own);
      $('mv-send-h').textContent = saved ? 'Saved on this phone' : 'Not kept on this phone';
      $('mv-send-p').textContent = (saved ? 'Your pad uses this layout now. ' : '') + 'To give it to every player, send this text to Claude. It goes live after the next push.';
      $('mv-text').value = text; $('mv-share').hidden = !navigator.share; box.hidden = false;
      $('mv-copy').textContent = 'Copy';
    }
    async function copy() {
      const t = $('mv-text');
      try { await navigator.clipboard.writeText(t.value); }
      catch (e) { t.focus(); t.select(); try { t.setSelectionRange(0, t.value.length); doc.execCommand('copy'); } catch (x) { /* he can still copy the chosen text by hand */ } }
      $('mv-copy').textContent = 'Copied';
    }

    // ---- The bar: small, and it can be dragged out of the way or folded ----
    const bar = el('div', 'mv-bar');
    bar.innerHTML = '<div class="t"><div id="mv-grip" title="Drag this bar out of the way">Move the parts</div><button id="mv-fold" title="Fold this bar to one row of buttons, or open it again">Fold</button><button id="mv-done" title="Leave the mover and go back to PLAY">Done</button></div>'
      + '<div class="r"><button id="mv-undo" title="Take back the last change">Undo</button><button id="mv-match" title="Give the chosen part the same size and gaps as its partner on the other side">Match</button><button id="mv-reset" title="Go back to the layout every player has now">Reset</button><button id="mv-save" title="Keep this layout on this phone and get the text to send">Save</button></div>'
      + '<div class="r x"><button id="mv-l" title="Move the chosen part one step left">&#9664;</button><button id="mv-u" title="Move the chosen part one step up">&#9650;</button><button id="mv-d" title="Move the chosen part one step down">&#9660;</button><button id="mv-r" title="Move the chosen part one step right">&#9654;</button></div>'
      + '<div class="r x"><button id="mv-less" title="Make the chosen part a little smaller">Smaller</button><button id="mv-more" title="Make the chosen part a little bigger">Bigger</button><select id="mv-game" title="Which machine\'s buttons to show on the pad"></select></div>'
      + '<div id="mv-say" role="status"></div>';
    over.appendChild(bar);
    const panel = el('div', 'mv-send'); panel.hidden = true;
    panel.innerHTML = '<div><h1 id="mv-send-h"></h1><p id="mv-send-p"></p><textarea id="mv-text" readonly aria-label="The layout as text"></textarea><nav><button id="mv-copy" class="go">Copy</button><button id="mv-share">Share</button><button id="mv-close">Close</button></nav></div>';
    over.appendChild(panel);
    function $(id) { return doc.getElementById(id); }
    // The bar is kept on the screen wherever it is.
    function seat() {
      const r = bar.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      if (!st.bar) st.bar = { x: (W - r.width) / 2, y: 6 };
      st.bar.x = Math.max(4, Math.min(st.bar.x, W - r.width - 4)); st.bar.y = Math.max(4, Math.min(st.bar.y, H - r.height - 4));
      bar.style.left = st.bar.x + 'px'; bar.style.top = st.bar.y + 'px';
    }
    const fold = (small) => { bar.classList.toggle('small', small); $('mv-fold').textContent = small ? 'Open' : 'Fold'; };
    // Where the bar starts, each way the phone is held: in the middle, in the tallest gap between the parts that lie
    // under it there, so no part is hidden under it. With no gap tall enough it folds to one row and tries again. Once
    // he has dragged it somewhere himself it stays where he put it until the phone turns.
    function home() {
      const spot = () => {
        const r = bar.getBoundingClientRect(), x = (innerWidth - r.width) / 2, H = innerHeight;
        const under = st.parts.map((p) => ({ l: st.area.x + p.box.x, r: st.area.x + p.box.x + p.box.w, t: st.area.y + p.box.y, b: st.area.y + p.box.y + p.box.h }))
          .filter((b) => b.l < x + r.width && b.r > x).sort((a, b) => a.t - b.t);
        let best = null, at = 0;
        for (const b of under.concat([{ t: H, b: H }])) { if (b.t - at > (best ? best.h : 0)) best = { y: at, h: b.t - at }; at = Math.max(at, b.b); }
        return best && best.h >= r.height + 8 ? { x, y: best.y + (best.h - r.height) / 2 } : null;
      };
      fold(false);
      let at = spot();
      if (!at) { fold(true); at = spot(); }
      st.bar = at || { x: (innerWidth - bar.getBoundingClientRect().width) / 2, y: 6 };
      seat();
    }
    $('mv-grip').addEventListener('pointerdown', (e) => {
      e.preventDefault(); const g = $('mv-grip'), sx = e.clientX - st.bar.x, sy = e.clientY - st.bar.y;
      try { g.setPointerCapture(e.pointerId); } catch (x) { /* as above */ }
      const move = (m) => { st.bar.x = m.clientX - sx; st.bar.y = m.clientY - sy; st.held = way(); seat(); };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    const tap = (id, f) => { $(id).onclick = f; };
    tap('mv-fold', () => { fold(!bar.classList.contains('small')); seat(); });
    tap('mv-done', () => { if (dirty()) { st.note = ['Not saved yet. Save first, or press Done again to leave; your changes stay as a draft.', 'bad']; draw(); tap('mv-done', leave); } else leave(); });
    const leave = () => { location.href = './'; };
    tap('mv-undo', undo); tap('mv-match', match); tap('mv-reset', reset); tap('mv-save', save);
    tap('mv-l', () => nudge(-1, 0)); tap('mv-r', () => nudge(1, 0)); tap('mv-u', () => nudge(0, -1)); tap('mv-d', () => nudge(0, 1));
    tap('mv-less', () => change((b) => grow(b, -2))); tap('mv-more', () => change((b) => grow(b, 2)));
    tap('mv-copy', copy); tap('mv-close', () => { panel.hidden = true; });
    tap('mv-share', () => { try { navigator.share({ text: $('mv-text').value }).catch(() => {}); } catch (e) { /* no share sheet after all */ } });
    GAMES.forEach(([name], i) => $('mv-game').add(new Option(name, i)));
    $('mv-game').onchange = () => { st.game = +$('mv-game').value; game(); };
    // A touch on the mover never reaches the pad under it (the pad would read it as a press).
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) over.addEventListener(ev, (e) => e.stopPropagation());
    over.addEventListener('pointerdown', (e) => { if (e.target === over) { st.sel = null; draw(); } });

    // ---- Which machine's buttons, and starting ----
    async function game() {
      const id = GAMES[st.game][1];
      try {
        if (!st.cards[id]) st.cards[id] = await (await fetch(o.cards + id + '.json')).json();
        door.draw(o.card(st.cards[id]));
      } catch (e) { st.note = ['That machine\'s buttons could not be loaded. Is the phone online?', 'bad']; draw(); return; }
      later(sync);
    }
    addEventListener('resize', () => { st.sel = null; if (st.held !== way()) st.homed = null; later(() => { sync(); seat(); }); });
    L.site(o.url).then((f) => {
      st.site = f;
      // A draft from before (the tab closed, the phone slept): his changes are back, still unsaved.
      let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { /* none */ }
      if (d && typeof d === 'object') for (const w of L.WAYS) if (w in d) {
        const c = d[w] ? (L.clean({ phone: { [w]: d[w] } }).phone || {})[w] || null : null;
        if (d[w] === null || c) { st.works[w] = { set: c, undo: [], touched: true }; st.note = ['Your changes from before are back. Not saved yet.']; }
      }
      game();
    });
  }
  api.start = start;
})(typeof self !== 'undefined' ? self : this);
