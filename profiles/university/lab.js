// Void University labs (15 Nov 2026). Bryan: "interactive teaching, analogous teaching, If This Then That labs ...
// in every teaching area". One engine for every lab, the same way crystal.js and scene.js are one engine each.
//
// A lab is a bench you can put your hands on, plus rules to find. Nothing is told first:
//   - knobs are the IF (what you change), the bench is the world that answers, the readout is the THEN;
//   - each rule shows its IF as a partial; its THEN appears only after you have made it happen yourself;
//   - every run is kept as a small picture, side by side, so you compare your own tries (no score, no marks);
//   - change one thing, run it again.
// A bench is a small file (lab-pegboard.js is the first) that registers itself here with:
//   make(planck, knobs, seed) -> a run with step(), done, speed;  result(run) -> { bars, mid, say };
//   run(planck, knobs, seed) -> the result at once (tests, hidden pages);  draw(ctx, W, H, run, knobs).
// The unit's "lab" block in the course file names the bench and supplies the words, the knobs and the rules:
//   { bench, title, ask, go, knobs: [{ id, label, options: [{ v, label }] }],
//     rules: [{ if, then, when: { knob: { id: value }, times } }], map: [[thing, idea]], meet }
(function () {
  const benches = {};
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function mount(root) {
    const cfg = JSON.parse(root.dataset.lab), bench = benches[cfg.bench];
    if (!bench || typeof planck === 'undefined') return;
    const canvas = root.querySelector('.lab-stage canvas'), ctx = canvas.getContext('2d');
    const side = root.querySelector('.lab-side'), triesEl = root.querySelector('.lab-tries'), rulesEl = root.querySelector('.lab-rules');
    const knobs = {}, tries = [], found = cfg.rules.map(() => false);
    let live = null, last = null, seed = 0, raf = 0, W = 0, H = 0;

    // The IF: one row of choices per knob.
    cfg.knobs.forEach((k) => {
      knobs[k.id] = k.options[0].v;
      const row = el('div', 'lab-knob'); row.appendChild(el('span', null, k.label));
      const seg = el('div', 'lab-seg');
      k.options.forEach((o, i) => {
        const b = el('button', i ? '' : 'on', o.label); b.type = 'button';
        b.onclick = () => { if (live) return; knobs[k.id] = o.v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); last = null; paint(); };
        seg.appendChild(b);
      });
      row.appendChild(seg); side.appendChild(row);
    });
    const go = el('button', 'lab-go', cfg.go || 'Run it'); go.type = 'button'; side.appendChild(go);
    const say = el('div', 'lab-say'); say.setAttribute('aria-live', 'polite'); say.textContent = 'Set it up, then run it and see.'; side.appendChild(say);

    function size() {
      const dpr = window.devicePixelRatio || 1; W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint();
    }
    function paint() { bench.draw(ctx, W, H, live || last, knobs); }

    const label = (kn) => cfg.knobs.map((k) => (k.options.find((o) => o.v === kn[k.id]) || {}).label).join(' · ');
    function thumb(r) {
      const c = el('canvas'); c.width = 132; c.height = 60; const x = c.getContext('2d'), n = r.bars.length, top = Math.max.apply(null, r.bars) || 1, bw = 132 / n;
      x.fillStyle = 'rgba(212,176,106,.55)'; x.fillRect(r.mid * bw + bw / 2 - 0.5, 0, 1, 60);
      x.fillStyle = '#efe9dc'; r.bars.forEach((v, i) => { const h = Math.max(v ? 2 : 0, v / top * 54); x.fillRect(i * bw + 1, 60 - h, bw - 2, h); });
      return c;
    }
    function renderTries() {
      triesEl.textContent = '';
      if (!tries.length) return;
      triesEl.appendChild(el('span', 'lab-h', 'Your tries, side by side'));
      const strip = el('div', 'lab-strip');
      tries.forEach((t, i) => { const f = el('figure'); f.appendChild(thumb(t.r)); f.appendChild(el('figcaption', null, (i + 1) + '. ' + label(t.knobs))); strip.appendChild(f); });
      triesEl.appendChild(strip); strip.scrollLeft = strip.scrollWidth;
    }
    // A rule is found once you have made its IF happen the number of times it asks for.
    function met(rule) {
      const w = rule.when || {}, want = w.knob || {};
      return tries.filter((t) => Object.keys(want).every((id) => t.knobs[id] === want[id])).length >= (w.times || 1);
    }
    function renderRules(fresh) {
      rulesEl.textContent = '';
      rulesEl.appendChild(el('span', 'lab-h', 'If this, then that: ' + found.filter(Boolean).length + ' of ' + found.length + ' found'));
      const ul = el('ul');
      cfg.rules.forEach((r, i) => {
        const li = el('li', found[i] ? 'found' + (fresh === i ? ' fresh' : '') : 'open');
        li.appendChild(el('b', null, 'If ')); li.appendChild(document.createTextNode(r.if + ' '));
        li.appendChild(el('b', null, 'then ')); li.appendChild(found[i] ? document.createTextNode(r.then) : el('i', null, '... make it happen and see.'));
        ul.appendChild(li);
      });
      rulesEl.appendChild(ul);
      if (found.every(Boolean) && cfg.meet) rulesEl.appendChild(el('p', 'lab-meet', cfg.meet));
    }
    function finish(r) {
      tries.push({ knobs: Object.assign({}, knobs), r }); if (tries.length > 12) tries.shift();
      say.textContent = r.say; renderTries();
      let fresh = -1; cfg.rules.forEach((rule, i) => { if (!found[i] && met(rule)) { found[i] = true; fresh = i; } });
      renderRules(fresh); root.classList.toggle('all', found.every(Boolean));
    }
    function frame() {
      if (!live) return;
      for (let i = 0; i < live.speed && !live.done; i++) live.step();
      paint();
      if (live.done) { const r = bench.result(live); last = live; live = null; go.disabled = false; root.classList.remove('running'); finish(r); paint(); return; }
      raf = requestAnimationFrame(frame);
    }
    go.onclick = () => {
      if (live) return;
      live = bench.make(planck, knobs, ++seed); go.disabled = true; root.classList.add('running'); say.textContent = 'Watch...';
      raf = requestAnimationFrame(frame);
    };
    // For checks and hidden pages: set knobs and get the result at once, with no animation.
    root._lab = {
      runNow(set) { cancelAnimationFrame(raf); live = null; go.disabled = false; root.classList.remove('running'); Object.assign(knobs, set || {}); const s = bench.make(planck, knobs, ++seed); while (!s.done) s.step(); last = s; const r = bench.result(s); finish(r); paint(); return r; },
      state: () => ({ knobs: Object.assign({}, knobs), tries: tries.length, found: found.slice() }),
    };
    window.addEventListener('resize', size); size(); renderRules(-1);
  }

  window.VULab = { bench(name, b) { benches[name] = b; }, mount };
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.lab').forEach(mount));
})();
