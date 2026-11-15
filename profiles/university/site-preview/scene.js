// Void University scene engine (15 Nov 2026). Bryan: "less words ... more diagram picture animated thing that shows
// the process", and "use analogies, one to ones that people can recognize from other areas of life". So a scene acts
// out an everyday analogy in a few beats, then the analogy's labels turn into the idea's labels in place: the bill
// becomes the claim, the receipt becomes the evidence. One engine for every unit and every course; a scene is data.
//
// Scene data (a unit's `scene` block in the course file):
//   { analogy, actors: [{ id, type, x, y, w, h, label, sub, color, o }], beats: [{ say, dur, set: { id: {...} } }] }
//   types: card (rounded box, label, sub), slot (dashed box), text, stamp (round badge), arrow (x,y to x2,y2; draw 0..1)
//   any beat may set: x y w h o (opacity) s (scale) label sub color dash shake (true wobbles during that beat) draw
// The picture at any moment is a pure function of (beat, progress), so it can be stepped, scrubbed or recorded.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 800, H = 360;
  const COL = { blue: '#5fd4ff', gold: '#f2a93b', pink: '#ff4fc8', green: '#5fe39a', dim: '#5a6078', fg: '#e8e8ee' };
  const col = (c) => COL[c] || c || COL.fg;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // Cumulative state after each beat: beat 0 is the actors as declared, beat i merges beat i's `set`.
  function states(sc) {
    let cur = {};
    sc.actors.forEach((a) => { cur[a.id] = Object.assign({ o: 1, s: 1, draw: 1 }, a); });
    const out = [];
    sc.beats.forEach((b) => {
      const next = {};
      for (const id in cur) next[id] = Object.assign({}, cur[id], { shake: false });
      for (const id in b.set || {}) next[id] = Object.assign(next[id] || {}, b.set[id]);
      out.push({ from: cur, to: next });
      cur = next;
    });
    return out;
  }

  function mount(root) {
    const sc = JSON.parse(root.dataset.scene);
    const st = states(sc);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': sc.analogy || 'scene' });
    root.querySelector('.sc-stage').appendChild(svg);
    const say = root.querySelector('.sc-say');
    const dots = root.querySelector('.sc-dots');
    const playBtn = root.querySelector('.sc-play');
    sc.beats.forEach((_, i) => {
      const d = document.createElement('button');
      d.type = 'button'; d.setAttribute('aria-label', 'Step ' + (i + 1));
      d.onclick = () => { stop(); go(i, 1); };
      dots.appendChild(d);
    });

    // One group per actor, rebuilt cheaply each frame from the interpolated state.
    const nodes = {};
    sc.actors.forEach((a) => { nodes[a.id] = el('g', {}, svg); });

    function draw(id, A, B, p, beatP) {
      const g = nodes[id];
      while (g.firstChild) g.removeChild(g.firstChild);
      const v = {};
      ['x', 'y', 'w', 'h', 'o', 's', 'x2', 'y2', 'draw'].forEach((k) => {
        const a = A[k] == null ? B[k] : A[k], b = B[k] == null ? a : B[k];
        v[k] = a == null ? 0 : lerp(a, b, p);
      });
      if (v.o <= 0.01) return;
      const color = p < 0.5 ? (A.color || B.color) : (B.color || A.color);
      const shake = B.shake ? Math.sin(beatP * Math.PI * 10) * 6 * (1 - beatP) : 0;
      const cx = v.x + (v.w || 0) / 2 + shake, cy = v.y + (v.h || 0) / 2;
      g.setAttribute('opacity', v.o);
      g.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + v.s + ') translate(' + -cx + ' ' + -cy + ')');
      const type = B.type || A.type;
      // Labels cross-fade when they change: the analogy's word fades out as the idea's word fades in.
      const label = (key, x, y, size, weight, fill) => {
        key = key || 'label';
        const pairs = A[key] !== B[key] && A[key] != null
          ? [[A[key], 1 - Math.min(1, p * 2)], [B[key], Math.max(0, p * 2 - 1)]] : [[B[key], 1]];
        pairs.forEach(([t, op]) => {
          if (!t || op <= 0) return;
          const n = el('text', { x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size,
            'font-weight': weight, fill: fill, opacity: op }, g);
          n.textContent = t;
        });
      };
      if (type === 'arrow') {
        const x2 = lerp(v.x, v.x2, v.draw), y2 = lerp(v.y, v.y2, v.draw);
        el('line', { x1: v.x, y1: v.y, x2: x2, y2: y2, stroke: col(color), 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
        if (v.draw > 0.9) {
          const ang = Math.atan2(v.y2 - v.y, v.x2 - v.x);
          const hx = (s) => x2 - 12 * Math.cos(ang + s), hy = (s) => y2 - 12 * Math.sin(ang + s);
          el('path', { d: 'M' + hx(0.5) + ' ' + hy(0.5) + ' L' + x2 + ' ' + y2 + ' L' + hx(-0.5) + ' ' + hy(-0.5), stroke: col(color), 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
        }
        return;
      }
      if (type === 'text') { label(null, v.x, v.y, B.size || 22, 600, col(color)); return; }
      if (type === 'stamp') {
        const r = (v.w || 70) / 2;
        el('circle', { cx: v.x + r, cy: v.y + r, r: r, fill: 'none', stroke: col(color), 'stroke-width': 4 }, g);
        label(null, v.x + r, v.y + r, B.size || 18, 800, col(color));
        return;
      }
      const dashed = type === 'slot' || B.dash;
      el('rect', { x: v.x, y: v.y, width: v.w, height: v.h, rx: 12, fill: dashed ? 'rgba(255,255,255,0.02)' : '#161926',
        stroke: col(color), 'stroke-width': dashed ? 2 : 2.5, 'stroke-dasharray': dashed ? '8 7' : 'none' }, g);
      label(null, v.x + v.w / 2, v.y + v.h / 2 - (B.sub ? 12 : 0), B.size || 22, 700, col(color));
      if (A.sub || B.sub) label('sub', v.x + v.w / 2, v.y + v.h / 2 + 18, 15, 400, '#aab0c2');
    }

    let beat = 0, prog = 0, playing = false, last = 0, raf = 0;
    function go(i, p) {
      beat = Math.max(0, Math.min(st.length - 1, i)); prog = Math.max(0, Math.min(1, p));
      const s = st[beat], e = ease(prog);
      for (const id in nodes) draw(id, s.from[id] || {}, s.to[id] || {}, e, prog);
      say.textContent = sc.beats[beat].say || '';
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= beat));
      root.classList.toggle('done', beat === st.length - 1 && prog >= 1);
    }
    function tick(t) {
      if (!playing) return;
      const dt = last ? (t - last) / 1000 : 0; last = t;
      prog += dt / (sc.beats[beat].dur || 2.4);
      if (prog >= 1) {
        if (beat < st.length - 1) { go(beat, 1); beat += 1; prog = 0; }
        else { go(beat, 1); stop(); return; }
      }
      go(beat, prog);
      raf = requestAnimationFrame(tick);
    }
    function play() {
      if (beat === st.length - 1 && prog >= 1) go(0, 0);
      playing = true; last = 0; playBtn.textContent = 'Pause'; raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; cancelAnimationFrame(raf); playBtn.textContent = beat === st.length - 1 && prog >= 1 ? 'Watch again' : 'Play'; }
    playBtn.onclick = () => (playing ? stop() : play());
    root.querySelector('.sc-back').onclick = () => { stop(); if (beat > 0) go(beat - 1, 1); else go(0, 0); };
    root.querySelector('.sc-next').onclick = () => { stop(); if (prog < 1) go(beat, 1); else go(beat + 1, 1); };
    go(0, 0);
    root._sc = { go: go, beats: st.length };
    // Starts by itself the first time it scrolls into view; after that the viewer drives it.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.6 });
      io.observe(root);
    }
  }

  document.querySelectorAll('.sc[data-scene]').forEach(mount);
})();
