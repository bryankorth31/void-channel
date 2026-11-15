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
// A hands-on bench (lab-lever.js) also gives its run: actions [{ id, label }] and act(id), so the learner's own hand
// drives it; say (a line that changes while it runs); and play(run, opts) to script it for checks. Its result may
// carry counts: false (this try does not find a rule) and tag (a few words for the try's caption).
// Guess first (Bryan: "a big part of learning is prediction and then interacting"; his Mind Atlas: the gap between
// what you predicted and what happened is what gets felt and stored). When the lab block has guess: { ask } and the
// bench has a guess part, the learner must commit to a guess before each run; afterwards the lab states the gap as a
// plain fact, never as right or wrong. The bench's guess part: pick(x, y, W, H, knobs) -> a value from a tap on the
// stage, or options(knobs) -> [{ v, label }] to choose from; gap(guess, result) -> one sentence;
// bar(guess, result) -> where to mark the guess on the try's small picture.
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
    const G = cfg.guess && bench.guess ? bench.guess : null;
    let guess = null, liveGuess = null, shownGuess = null;

    // The IF: one row of choices per knob.
    cfg.knobs.forEach((k) => {
      knobs[k.id] = k.options[0].v;
      const row = el('div', 'lab-knob'); row.appendChild(el('span', null, k.label));
      const seg = el('div', 'lab-seg');
      k.options.forEach((o, i) => {
        const b = el('button', i ? '' : 'on', o.label); b.type = 'button';
        b.onclick = () => { if (live) return; knobs[k.id] = o.v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); last = null; guess = shownGuess = null; renderGuess(); paint(); };
        seg.appendChild(b);
      });
      row.appendChild(seg); side.appendChild(row);
    });
    const gEl = el('div', 'lab-guess'); if (G) side.appendChild(gEl);
    const go = el('button', 'lab-go', cfg.go || 'Run it'); go.type = 'button'; side.appendChild(go);
    function setGuess(v) { if (live || v == null) return; guess = shownGuess = v; last = null; renderGuess(); paint(); }
    function renderGuess() {
      if (!G) return;
      gEl.textContent = ''; gEl.classList.toggle('made', guess != null);
      gEl.appendChild(el('span', null, cfg.guess.ask));
      if (G.options) {
        const seg = el('div', 'lab-seg');
        G.options(knobs).forEach((o) => { const b = el('button', guess === o.v ? 'on' : '', o.label); b.type = 'button'; b.onclick = () => setGuess(o.v); seg.appendChild(b); });
        gEl.appendChild(seg);
      }
      if (!live) go.disabled = guess == null;
    }
    const acts = el('div', 'lab-acts'); side.appendChild(acts);
    canvas.addEventListener('pointerdown', (e) => {
      if (live) { if (live.actions) live.act(live.actions[0].id); return; }
      if (G && G.pick) { const b = canvas.getBoundingClientRect(); setGuess(G.pick(e.clientX - b.left, e.clientY - b.top, W, H, knobs)); }
    });
    const say = el('div', 'lab-say'); say.setAttribute('aria-live', 'polite'); say.textContent = G ? 'Set it up, make your guess, then run it.' : 'Set it up, then run it and see.'; side.appendChild(say);

    function size() {
      const dpr = window.devicePixelRatio || 1; W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paint();
    }
    function paint() { bench.draw(ctx, W, H, live || last, knobs, shownGuess); }

    const label = (kn) => cfg.knobs.map((k) => (k.options.find((o) => o.v === kn[k.id]) || {}).label).join(' · ');
    function thumb(r) {
      const c = el('canvas'); c.width = 132; c.height = 60; const x = c.getContext('2d'), n = r.bars.length, top = r.barTop || Math.max.apply(null, r.bars) || 1, bw = 132 / n;
      x.fillStyle = '#efe9dc'; r.bars.forEach((v, i) => { const h = Math.max(v ? 2 : 0, v / top * 54); x.fillRect(i * bw + 1, 60 - h, bw - 2, h); });
      if (r.mid != null) { x.fillStyle = '#d4b06a'; x.fillRect(r.mid * bw + bw / 2 - 1, 0, 2, 60); } // the bench's marker line, drawn over the bars so it always shows
      if (r.guessBar != null) { const gx = r.guessBar * bw + bw / 2; x.fillStyle = '#e08a8f'; x.beginPath(); x.moveTo(gx - 6, 0); x.lineTo(gx + 6, 0); x.lineTo(gx, 10); x.closePath(); x.fill(); } // the learner's guess
      return c;
    }
    function renderTries() {
      triesEl.textContent = '';
      if (!tries.length) return;
      triesEl.appendChild(el('span', 'lab-h', 'Your tries, side by side' + (cfg.triesNote ? ': ' + cfg.triesNote : '')));
      const strip = el('div', 'lab-strip');
      tries.forEach((t, i) => { const f = el('figure'); f.appendChild(thumb(t.r)); f.appendChild(el('figcaption', null, (i + 1) + '. ' + label(t.knobs) + (t.r.tag ? ' · ' + t.r.tag : ''))); strip.appendChild(f); });
      triesEl.appendChild(strip); strip.scrollLeft = strip.scrollWidth;
    }
    // A rule is found once you have made its IF happen the number of times it asks for.
    function met(rule) {
      const w = rule.when || {}, want = w.knob || {};
      return tries.filter((t) => t.r.counts !== false && Object.keys(want).every((id) => t.knobs[id] === want[id])).length >= (w.times || 1);
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
    function finish(r, g) {
      if (G && g != null) { const gap = G.gap(g, r); if (gap) r.say += ' ' + gap; r.guessBar = G.bar ? G.bar(g, r) : null; }
      guess = null; renderGuess();
      tries.push({ knobs: Object.assign({}, knobs), r }); if (tries.length > 12) tries.shift();
      say.textContent = r.say; renderTries();
      let fresh = -1; cfg.rules.forEach((rule, i) => { if (!found[i] && met(rule)) { found[i] = true; fresh = i; } });
      renderRules(fresh); root.classList.toggle('all', found.every(Boolean));
    }
    function frame() {
      if (!live) return;
      for (let i = 0; i < live.speed && !live.done; i++) live.step();
      paint();
      if (live.say != null && say.textContent !== live.say) say.textContent = live.say;
      if (live.done) { const r = bench.result(live); last = live; live = null; go.disabled = false; root.classList.remove('running', 'hands'); acts.textContent = ''; finish(r, liveGuess); paint(); return; }
      raf = requestAnimationFrame(frame);
    }
    go.onclick = () => {
      if (live || (G && guess == null)) return;
      liveGuess = guess;
      live = bench.make(planck, knobs, ++seed); go.disabled = true; root.classList.add('running'); say.textContent = 'Watch...';
      if (live.actions) {
        root.classList.add('hands');
        live.actions.forEach((a, i) => { const b = el('button', i ? 'lab-act' : 'lab-act main', a.label); b.type = 'button'; b.onclick = () => { if (live) live.act(a.id); }; acts.appendChild(b); });
      }
      raf = requestAnimationFrame(frame);
    };
    // For checks and hidden pages: set knobs and get the result at once, with no animation.
    root._lab = {
      runNow(set, opts) { cancelAnimationFrame(raf); live = null; go.disabled = false; root.classList.remove('running', 'hands'); acts.textContent = ''; Object.assign(knobs, set || {}); const g = opts && opts.guess != null ? opts.guess : null; shownGuess = g; const s = bench.make(planck, knobs, ++seed); if (bench.play) bench.play(s, opts); while (!s.done) s.step(); last = s; const r = bench.result(s); finish(r, g); paint(); return r; },
      pick(x, y) { setGuess(G && G.pick ? G.pick(x, y, W, H, knobs) : null); return guess; },
      state: () => ({ knobs: Object.assign({}, knobs), tries: tries.length, found: found.slice(), guess, goOff: go.disabled }),
    };
    window.addEventListener('resize', size); size(); renderRules(-1); renderGuess();
  }

  window.VULab = { bench(name, b) { benches[name] = b; }, mount };
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.lab').forEach(mount));
})();
