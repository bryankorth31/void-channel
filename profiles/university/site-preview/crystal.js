// Void University crystal (15 Nov 2026). Bryan's nucleation learning made visible, in his words from the Mind Atlas:
// "give the person ... the partial patterns and then allow them to find the nucleation event on their own which
// crystallizes and that's where they get the aha moment"; "frozen water that doesnt crystalize until you create a
// nucleation point"; five partials "need a specific 6th one ... But they incorrectly took another partial ... that
// then broke the structure"; "not a quiz"; learned "when they ... answer in another way".
//
// The growth follows real crystal rules, kept simple:
//   - a supercooled liquid holds everything but nothing sets until a seed is added (nucleation);
//   - a molecule joins where it has the most solid neighbours, which makes flat hexagonal faces;
//   - cooling fast traps impurities inside (inclusions); slow growth comes out clear;
//   - a wrong seed starts a second, misaligned grain; where grains meet the crystal cracks (a grain boundary);
//   - annealing (heat, then slow cooling) lets the larger grain absorb the smaller and pushes impurities out;
//     a wrong core cannot be annealed away, so the crystal melts back and you choose again.
(function () {
  const SQ3 = Math.sqrt(3);
  const COL = { a: [95, 212, 255], b: [255, 79, 200], inc: [70, 74, 92] };

  function mount(root, cfg) {
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const status = root.querySelector('.cx-status');
    const choices = root.querySelector('.cx-choices');
    const speedEl = root.querySelector('.cx-speed');
    const heatBtn = root.querySelector('.cx-heat');
    const resetBtn = root.querySelector('.cx-reset');
    const after = root.querySelector('.cx-after');
    const chips = [...root.querySelectorAll('.cx-chip')];
    speedEl.value = cfg.speed != null ? cfg.speed : 0.3;

    let W = 0, H = 0, R = 6, cols = 0, rows = 0, cells, born, frontier, mols = [];
    let solidN = 0, mode = 'liquid', wrong = null, heatT = 0, tick = 0, center = { x: 0, y: 0 }, lim = { rx: 0, ry: 0 };

    function size() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = W < 700 ? 5 : 6;
      cols = Math.ceil(W / (SQ3 * R)) + 1; rows = Math.ceil(H / (1.5 * R)) + 1;
      center = { x: W / 2, y: H / 2 };
      const side = Math.min(240, W * 0.26);
      lim = { rx: Math.max(60, W / 2 - side - 24), ry: H * 0.44 };
      reset(false);
    }
    const idx = (c, r) => r * cols + c;
    const pos = (c, r) => ({ x: c * SQ3 * R + (r & 1 ? SQ3 * R / 2 : 0), y: r * 1.5 * R });
    function nb(c, r) {
      const o = r & 1 ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
      const out = [];
      for (const [dc, dr] of o) { const cc = c + dc, rr = r + dr; if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) out.push(idx(cc, rr)); }
      return out;
    }
    const inside = (i) => { const p = pos(i % cols, (i / cols) | 0); const dx = (p.x - center.x) / lim.rx, dy = (p.y - center.y) / lim.ry; return dx * dx + dy * dy < 1; };
    const cellAt = (x, y) => { const r = Math.round(y / (1.5 * R)); const c = Math.round((x - (r & 1 ? SQ3 * R / 2 : 0)) / (SQ3 * R)); return idx(Math.max(0, Math.min(cols - 1, c)), Math.max(0, Math.min(rows - 1, r))); };

    function reset(msg = true) {
      cells = new Uint8Array(cols * rows); born = new Float32Array(cols * rows); frontier = new Set();
      mode = 'liquid'; wrong = null; heatT = 0;
      mols = Array.from({ length: Math.round(W * H / 2600) }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0 }));
      chips.forEach((c) => { c.classList.remove('set', 'bad'); c.style.transform = ''; });
      root.classList.remove('aha', 'broken');
      choices.querySelectorAll('button').forEach((b) => { b.disabled = false; b.classList.remove('picked', 'wrongpick'); });
      after.hidden = true; heatBtn.disabled = true;
      if (msg) say('Supercooled: every partial is here, and nothing has set. Pick the piece that makes it set.');
    }
    function seed(i, grain) { cells[i] = grain; born[i] = tick; for (const n of nb(i % cols, (i / cols) | 0)) if (!cells[n] && inside(n)) frontier.add(n); }
    function say(t) { status.textContent = t; }

    function pick(btn) {
      if (mode !== 'liquid') return;
      const ok = btn.dataset.key === '1';
      btn.classList.add(ok ? 'picked' : 'wrongpick');
      choices.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const c0 = cellAt(center.x, center.y);
      if (ok) {
        seed(c0, 1); mode = 'growing'; wrong = null;
        say('Nucleation. It sets all at once, in one direction.');
      } else {
        wrong = btn.dataset.why || 'That piece does not fit the others.';
        cells[c0] = 3; born[c0] = tick;
        // the wrong piece sits at the core; two grains grow from either side of it and can never line up
        seed(cellAt(center.x - lim.rx * 0.35, center.y - 8), 1);
        seed(cellAt(center.x + lim.rx * 0.35, center.y + 8), 2);
        for (const n of nb(c0 % cols, (c0 / cols) | 0)) if (!cells[n]) frontier.add(n);
        mode = 'growing';
        say('It sets, but around the wrong piece. Watch where it grows.');
      }
    }

    function grow() {
      const speed = +speedEl.value;
      const per = Math.max(12, Math.round((frontier.size || 1) * (0.35 + speed * 0.5)));
      const arr = [...frontier];
      for (let k = 0; k < per && arr.length; k++) {
        const j = (Math.random() * arr.length) | 0, i = arr[j];
        arr[j] = arr[arr.length - 1]; arr.pop();
        if (cells[i]) { frontier.delete(i); continue; }
        const ns = nb(i % cols, (i / cols) | 0);
        let a = 0, b = 0, s = 0;
        for (const n of ns) { if (cells[n] === 1) a++; else if (cells[n] === 2) b++; if (cells[n]) s++; }
        // more solid neighbours = a better place to land; at slow cooling this rule makes clean flat faces
        const p = Math.min(1, (0.12 + 0.09 * s * s) * (0.7 + speed));
        if (Math.random() > p) continue;
        frontier.delete(i);
        // below about 0.4 the growth is slow enough to push impurities ahead of the face; above it they get trapped
        const inc = Math.random() < Math.max(0, speed - 0.4) ** 2 * 0.25;
        cells[i] = inc ? 3 : b > a ? 2 : a > b ? 1 : (a ? (Math.random() < 0.5 ? 1 : 2) : 1);
        born[i] = tick;
        for (const n of ns) if (!cells[n] && inside(n)) frontier.add(n);
      }
      if (!frontier.size) finish();
    }

    function counts() { let inc = 0, bnd = 0, sol = 0; for (let i = 0; i < cells.length; i++) { if (!cells[i]) continue; sol++; if (cells[i] === 3) inc++; else for (const n of nb(i % cols, (i / cols) | 0)) if (cells[n] && cells[n] !== 3 && cells[n] !== cells[i]) { bnd++; break; } } return { inc, bnd, sol }; }

    function finish() {
      mode = 'set'; heatBtn.disabled = false;
      const { inc, bnd } = counts();
      if (wrong) {
        root.classList.add('broken');
        chips.forEach((c, i) => { c.classList.add('bad'); c.style.transform = 'translate(' + (i % 2 ? 6 : -6) + 'px,0)'; });
        say('Malformed. ' + wrong + ' The crack runs where the two halves could not line up (' + bnd + ' cells on the break). Heat it to melt it back, then choose again.');
      } else if (inc > 3) {
        say('Set, but it grew fast and trapped ' + inc + ' flaws inside. ' + (cfg.aha || '') + ' Heat it to anneal them out, or slow the cooling and grow it again.');
        aha(false);
      } else { say('Set clean.'); aha(true); }
    }

    function aha(clean) {
      root.classList.add('aha');
      chips.forEach((c) => c.classList.add('set'));
      after.hidden = false;
      if (clean) say(cfg.aha || 'Set clean.');
    }

    function heat() {
      if (mode !== 'set') return;
      mode = 'heating'; heatT = 0; heatBtn.disabled = true;
      say(wrong ? 'Heating. A wrong core cannot be annealed away: it melts back to liquid.' : 'Annealing: the flaws work their way out as it cools slowly.');
    }
    function heatStep() {
      heatT++;
      if (wrong) {
        // melt from the outside in, the way a crystal dissolves
        let any = false;
        for (let i = 0; i < cells.length; i++) {
          if (!cells[i]) continue; any = true;
          let s = 0; for (const n of nb(i % cols, (i / cols) | 0)) if (cells[n]) s++;
          if (Math.random() < (6 - s) * 0.12 + 0.01) cells[i] = 0;
        }
        if (!any) { reset(false); say('Melted back. The partials are all still here. Choose the piece again.'); }
        return;
      }
      // annealing: impurities diffuse out; the bigger grain absorbs the smaller one cell by cell
      let a = 0, b = 0; for (let i = 0; i < cells.length; i++) { if (cells[i] === 1) a++; else if (cells[i] === 2) b++; }
      const big = a >= b ? 1 : 2;
      let left = 0;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === 3) { left++; if (Math.random() < 0.06) { cells[i] = big; born[i] = tick; } }
        else if (cells[i] && cells[i] !== big) { left++; for (const n of nb(i % cols, (i / cols) | 0)) if (cells[n] === big && Math.random() < 0.08) { cells[i] = big; born[i] = tick; break; } }
      }
      if (!left || heatT > 600) { mode = 'set'; heatBtn.disabled = false; say('Annealed. No trapped flaws, one clean crystal, stronger now than before it was wrong. ' + (cfg.aha || '')); aha(false); }
    }

    function draw() { step(); if (visible) requestAnimationFrame(draw); else running = false; }
    function step() {
      tick++;
      if (tick % 10 === 0) { root.dataset.mode = mode; root.dataset.tick = tick; }
      if (mode === 'growing') grow();
      if (mode === 'heating') heatStep();
      ctx.clearRect(0, 0, W, H);
      // the liquid: molecules drifting, fewer as they join the crystal
      if (mode === 'liquid') solidN = 0; else if (tick % 15 === 0) solidN = counts().sol;
      const solid = solidN;
      const free = Math.max(0, mols.length - Math.round(solid * 0.35));
      ctx.fillStyle = 'rgba(160,190,220,.35)';
      for (let k = 0; k < free; k++) {
        const m = mols[k];
        m.vx += (Math.random() - 0.5) * 0.3; m.vy += (Math.random() - 0.5) * 0.3; m.vx *= 0.9; m.vy *= 0.9;
        m.x = (m.x + m.vx + W) % W; m.y = (m.y + m.vy + H) % H;
        ctx.fillRect(m.x, m.y, 1.6, 1.6);
      }
      if (mode === 'liquid' && tick % 40 < 20) {
        // sub-critical clusters: in a supercooled liquid tiny groups form and dissolve, never reaching the size to set
        ctx.fillStyle = 'rgba(95,212,255,.10)';
        for (let k = 0; k < 6; k++) { const a = (tick * 0.013 + k) * 2.4; ctx.beginPath(); ctx.arc(center.x + Math.cos(a) * lim.rx * 0.5, center.y + Math.sin(a * 1.3) * lim.ry * 0.5, 4 + (k % 3) * 2, 0, 7); ctx.fill(); }
      }
      // the crystal
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i]; if (!v) continue;
        const c = i % cols, r = (i / cols) | 0, p = pos(c, r);
        const age = Math.min(1, (tick - born[i]) / 40);
        const col = v === 1 ? COL.a : v === 2 ? COL.b : COL.inc;
        const glow = v === 3 ? 0.9 : 0.35 + 0.65 * (1 - age);
        ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (v === 3 ? 0.95 : 0.25 + glow * 0.55) + ')';
        hex(p.x, p.y, R * 0.92); ctx.fill();
        if (v !== 3) for (const n of nb(c, r)) if (cells[n] && cells[n] !== 3 && cells[n] !== v) { const q = pos(n % cols, (n / cols) | 0); ctx.strokeStyle = 'rgba(242,169,59,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo((p.x + q.x) / 2 - (q.y - p.y) * 0.4, (p.y + q.y) / 2 + (q.x - p.x) * 0.4); ctx.lineTo((p.x + q.x) / 2 + (q.y - p.y) * 0.4, (p.y + q.y) / 2 - (q.x - p.x) * 0.4); ctx.stroke(); }
      }
      // the arch: once it has set, every partial is tied to the capstone
      if (root.classList.contains('aha')) {
        const box = canvas.getBoundingClientRect();
        ctx.strokeStyle = 'rgba(95,212,255,.35)'; ctx.lineWidth = 1;
        chips.forEach((ch) => { const b = ch.getBoundingClientRect(); const x = (b.left + b.right) / 2 - box.left, y = (b.top + b.bottom) / 2 - box.top; ctx.beginPath(); ctx.moveTo(x < center.x ? b.right - box.left : b.left - box.left, y); ctx.lineTo(center.x, center.y); ctx.stroke(); });
      }
    }
    function hex(x, y, r) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }

    // for checks: run frames without the screen (a hidden page gets no animation frames)
    root._cx = { step: (k = 1) => { for (let i = 0; i < k; i++) step(); return mode; } };
    choices.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(b); });
    heatBtn.addEventListener('click', heat);
    resetBtn.addEventListener('click', () => reset(true));
    const say2 = root.querySelector('.cx-say');
    if (say2) {
      const k = 'vu-say-' + cfg.id;
      try { say2.value = localStorage.getItem(k) || ''; } catch (e) {}
      say2.addEventListener('input', () => { try { localStorage.setItem(k, say2.value); } catch (e) {} });
    }
    // run only while on screen, so six crystals on one page cost nothing when scrolled away
    let visible = false, running = false;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !running) { running = true; requestAnimationFrame(draw); } }).observe(canvas);
    new ResizeObserver(() => { if (canvas.clientWidth !== W) { size(); say('Supercooled: every partial is here, and nothing has set. Pick the piece that makes it set.'); } }).observe(canvas);
    size(); say('Supercooled: every partial is here, and nothing has set. Pick the piece that makes it set.');
  }

  window.VoidCrystal = { mount };
  document.querySelectorAll('.cx[data-cfg]').forEach((el) => mount(el, JSON.parse(el.dataset.cfg)));
})();
