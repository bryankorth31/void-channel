// Void University explainers: the stage (22 Nov 2026). A unit's "explainer" block is a real system built in 3D from
// its data file: stores that fill and drain, the flows between them, the choices people argue about as faders, and
// the measured years to replay. explain-model.js does the arithmetic (the same code the tests run); this file draws
// the world, wires the hands to it, and keeps the guess, the rules you find, the line under the stage and the trace.
// The page builder (build.js, explainBlock) writes the parts, their words, the faders and the sources as plain HTML,
// so all of it reads and works with no 3D at all.
// A world is drawn by kind: "globe" is the Earth from space (NASA Blue Marble, with Natural Earth's land outline to
// tell land from sea), with the store as specks in the air and each flow as specks rising from or sinking into the
// ground or the sea where that flow happens; "basin" is a river basin as real ground (see basin() below). three.js
// (vendor, MIT) does the drawing.
import * as THREE from './three.module.min.js';

const M = window.VUExplainModel;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TONES = { hot: 0xff4f8b, amber: 0xffb347, cold: 0x5fd4ff, green: 0x6fe39a, gold: 0xffc44d, violet: 0x9b8cf0, mist: 0xdfe8ff, deep: 0x2f8cff };
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
// A rule found anywhere is remembered in this browser only (vu:found), so the If this, then that page and a return
// visit show it found. Nothing leaves the device.
const FOUND_KEY = 'vu:found';
const foundSet = () => { try { return new Set(JSON.parse(localStorage.getItem(FOUND_KEY) || '[]')); } catch (e) { return new Set(); } };
const remember = (key) => { try { const s = foundSet(); s.add(key); localStorage.setItem(FOUND_KEY, JSON.stringify([...s])); } catch (e) { /* storage off: found for this visit only */ } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// Labels placed on a world can land on top of each other; push each one down past those above it that it overlaps.
function unstack(labels) {
  const shown = labels.filter((L) => !L.b.hidden).map((L) => { const m = /translate\((-?\d+)px,(-?\d+)px\)/.exec(L.b.style.transform) || [0, 0, 0]; return { L, x: +m[1], y: +m[2], w: L.b.offsetWidth, h: L.b.offsetHeight }; }).sort((a, b) => a.y - b.y);
  for (let i = 0; i < shown.length; i++) for (let j = 0; j < i; j++) {
    const a = shown[j], b = shown[i];
    if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2) { b.y = a.y + (a.h + b.h) / 2 + 3; b.L.b.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px) translate(-50%,-50%)'; }
  }
}
function mount(root) {
  const ex = JSON.parse(root.dataset.ex);
  const model = M.make(ex);
  root.classList.add('js');
  const stage = root.querySelector('.ex-stage'), canvas = stage.querySelector('canvas');
  const sayEl = root.querySelector('.ex-say'), hud = root.querySelector('.ex-hud'), card = root.querySelector('.ex-card');
  const labelBox = root.querySelector('.ex-labels'), rulesEl = root.querySelector('.ex-rules');
  const trace = root.querySelector('.ex-trace'), balance = root.querySelector('.ex-balance');
  const parts = [...root.querySelectorAll('.ex-parts button')];
  const btn = (k) => root.querySelector('[data-do="' + k + '"]');
  const main = ex.stores[0], unitName = main.unit.name;

  // ----- the world's state: the clock, the choices, the mode (today, run, replay) and what the learner has done
  const choices = {}; ex.choices.forEach((c) => { choices[c.id] = c.start; });
  let state = model.start(), mode = 'today', playing = false, speed = 3, seg = { year: state.year, key: '' };
  let runTrace = [], replayYear = ex.clock.from, guessed = null, guessRun = null;
  const had = foundSet(), key = root.dataset.key || '';
  const found = ex.rules.map((r, i) => !!key && had.has(key + '/' + i));
  const faders = ex.choices.map((c) => {
    const input = root.querySelector('input[data-choice="' + c.id + '"]'), out = root.querySelector('output[data-choice="' + c.id + '"]');
    input.addEventListener('input', () => { choices[c.id] = Number(input.value); out.textContent = M.fmt(choices[c.id]); if (mode === 'today') mode = 'run'; seg = { year: state.year, key: JSON.stringify(choices) }; paintAll(); });
    return { c, input, out };
  });
  const setFaders = (vals, lock) => faders.forEach((f) => { if (vals[f.c.id] != null) { f.input.value = vals[f.c.id]; f.out.textContent = M.fmt(vals[f.c.id]); } f.input.disabled = !!lock; });

  // ----- the numbers of the moment: in replay they are the measured ones, otherwise the model's
  function now() {
    if (mode === 'replay') {
      const y = Math.min(Math.floor(replayYear), ex.clock.now), p = model.period(y) || { flows: {} };
      const v = {}; for (const s of ex.stores) v[s.id] = model.measured(s.id, y);
      return { year: y, stores: v, flows: p.flows, measured: true, period: p.name };
    }
    const fl = model.flows(state, choices), v = {};
    for (const s of ex.stores) v[s.id] = model.shown(state, s.id);
    return { year: Math.floor(state.year + 1e-6), stores: v, flows: fl, measured: false };
  }
  function changeOf(n, id) { // a store's change a year, in its unit
    const s = ex.stores.find((x) => x.id === id);
    const net = ex.flows.reduce((a, f) => a + (f.to === id ? n.flows[f.id] || 0 : 0) - (f.from === id ? n.flows[f.id] || 0 : 0), 0);
    return net / s.unit.per;
  }
  function line(n) {
    const v = { year: String(n.year) };
    for (const f of ex.flows) v[f.id] = n.flows[f.id] == null ? 0 : n.flows[f.id];
    for (const s of ex.stores) {
      const ch = changeOf(n, s.id);
      v[s.id] = n.stores[s.id]; v[s.id + 'change'] = Math.abs(ch); v[s.id + 'way'] = Math.abs(ch) < 0.05 ? 'holds, changing' : ch > 0 ? 'rises' : 'falls';
    }
    return M.say(n.measured ? ex.say.replay : ex.say.run, v);
  }

  // ----- the trace: the measured years in white, the learner's run in pink, the old level as a faint line
  const tctx = trace.getContext('2d');
  function paintTrace(n) {
    const dpr = devicePixelRatio || 1, W = trace.clientWidth, H = trace.clientHeight;
    if (!W) return;
    if (trace.width !== Math.round(W * dpr)) { trace.width = Math.round(W * dpr); trace.height = Math.round(H * dpr); }
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, W, H);
    const one = ex.stores.length === 1;
    const lines = ex.stores.map((st) => ({ st, hist: Object.entries(ex.history.stores[st.id]).map(([y, v]) => [Number(y), v]), run: runTrace.map(([y, v]) => [y, v[st.id]]), tone: css(TONES[st.color] || 0xff4f8b) }));
    const all = lines.flatMap((l) => l.hist.map((p) => p[1]).concat(l.run.map((p) => p[1]))).concat(main.base != null ? [main.base] : []);
    const span = Math.max(...all) - Math.min(...all), stepV = span > 300 ? 100 : span > 60 ? 50 : span > 12 ? 5 : 1;
    const lo = Math.floor(Math.min(...all) / stepV) * stepV, hi = Math.max(Math.ceil(Math.max(...all) / stepV) * stepV, lo + stepV * 2);
    const L = 34, R = 8, T = 8, B = 18;
    const X = (y) => L + (y - ex.clock.from) / (ex.clock.to - ex.clock.from) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    tctx.font = '11px system-ui, sans-serif'; tctx.fillStyle = 'rgba(220,224,240,.7)'; tctx.strokeStyle = 'rgba(255,255,255,.08)'; tctx.lineWidth = 1;
    for (let v = lo; v <= hi; v += stepV * (hi - lo > stepV * 8 ? 2 : 1)) { tctx.beginPath(); tctx.moveTo(L, Y(v)); tctx.lineTo(W - R, Y(v)); tctx.stroke(); tctx.fillText(String(v), 2, Y(v) + 4); }
    for (const y of [ex.clock.from, ex.clock.now, ex.clock.to]) tctx.fillText(String(y), clamp(X(y) - 14, L, W - 32), H - 4);
    if (main.base != null) { tctx.setLineDash([4, 4]); tctx.strokeStyle = 'rgba(200,210,230,.45)'; tctx.beginPath(); tctx.moveTo(L, Y(main.base)); tctx.lineTo(W - R, Y(main.base)); tctx.stroke(); tctx.setLineDash([]); tctx.fillText(main.baseWords || '', L + 4, Y(main.base) - 4); }
    const path = (pts, color, w, alpha) => { pts = pts.filter((p) => p[1] != null); if (pts.length < 2) return; tctx.globalAlpha = alpha || 1; tctx.strokeStyle = color; tctx.lineWidth = w; tctx.beginPath(); pts.forEach(([y, v], i) => (i ? tctx.lineTo(X(y), Y(v)) : tctx.moveTo(X(y), Y(v)))); tctx.stroke(); tctx.globalAlpha = 1; };
    lines.forEach((l, i) => {
      path(l.hist.filter(([y]) => mode !== 'replay' || y <= replayYear), one ? '#f6f7fb' : l.tone, 2, one ? 1 : 0.55);
      path(l.run, one ? '#ff4f8b' : l.tone, 2.5);
      const v = n.stores[l.st.id]; if (v != null) { tctx.fillStyle = one ? (n.measured ? '#f6f7fb' : '#ff4f8b') : l.tone; tctx.beginPath(); tctx.arc(X(n.year), Y(v), 4, 0, 7); tctx.fill(); }
      if (!one) { tctx.fillStyle = l.tone; tctx.fillText(l.st.name, W - R - 6 - tctx.measureText(l.st.name).width, T + 10 + i * 13); }
    });
  }
  // ----- the balance: what goes in against what comes out this year, as two bars in the flows' own colours
  function paintBalance(n) {
    const ins = ex.flows.filter((f) => f.to === main.id), outs = ex.flows.filter((f) => f.from === main.id);
    const sum = (fs) => fs.reduce((a, f) => a + Math.max(0, n.flows[f.id] || 0), 0);
    const top = Math.max(sum(ins), sum(outs), 1e-9);
    const bar = (fs, label) => '<div class="ex-bal"><span>' + label + ' <b>' + M.fmt(sum(fs)) + '</b></span><div class="ex-bar">' + fs.map((f) => '<i title="' + f.name + ': ' + M.fmt(n.flows[f.id] || 0) + '" style="width:' + (Math.max(0, n.flows[f.id] || 0) / top * 100).toFixed(2) + '%;background:' + css(TONES[f.color]) + '"></i>').join('') + '</div></div>';
    balance.innerHTML = bar(ins, 'Goes in') + bar(outs, 'Comes out') + '<p>Billions of tonnes of carbon a year' + (n.measured ? ', ' + n.period : '') + '.</p>';
  }
  function paintParts(n) {
    parts.forEach((b) => {
      const id = b.dataset.part, s = ex.stores.find((x) => x.id === id);
      b.querySelector('.v').textContent = s ? M.fmt(n.stores[id]) + ' ' + s.unit.name : M.fmt(n.flows[id] || 0) + ' a year';
    });
  }
  function paintHud(n) {
    if (ex.stores.length > 1) {
      hud.innerHTML = '<b>' + n.year + '</b>' + ex.stores.map((st) => { const ch = changeOf(n, st.id), lv = model.level ? model.level(st.id, n.stores[st.id]) : null; return '<span class="st"><small>' + st.name + '</small> ' + M.fmt(n.stores[st.id]) + ' <small>' + st.unit.name + (lv ? ', ' + lv : '') + '</small></span><em>' + (ch >= 0 ? '+' : '&#8722;') + Math.abs(ch).toFixed(2) + ' a year</em>'; }).join('') + (n.measured ? '<i>measured</i>' : '');
      return;
    }
    const ch = changeOf(n, main.id);
    hud.innerHTML = '<b>' + n.year + '</b><span>' + M.fmt(n.stores[main.id]) + ' <small>' + unitName + '</small></span><em>' + (ch >= 0 ? '+' : '&#8722;') + Math.abs(ch).toFixed(1) + ' ' + unitName + ' a year</em>' + (n.measured ? '<i>measured</i>' : '');
  }
  function paintAll() {
    const n = now();
    sayEl.textContent = line(n);
    paintTrace(n); paintBalance(n); paintParts(n); paintHud(n);
    btn('play').textContent = playing ? 'Pause' : mode === 'replay' ? 'Play the measured years' : 'Play the years ahead';
    btn('play').title = playing ? 'Stop the clock here' : mode === 'replay' ? 'Play the measured years from ' + ex.clock.from : 'Run the world forward a year at a time with your settings';
    root.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
    if (world) world.paint(n);
  }

  // ----- the rules you find: each "then" shows only once you have made its "if" happen yourself
  function renderRules(fresh) {
    rulesEl.textContent = '';
    rulesEl.appendChild(el('span', 'ex-h', 'If this, then that: ' + found.filter(Boolean).length + ' of ' + found.length + ' found'));
    const ul = el('ul');
    ex.rules.forEach((r, i) => {
      const li = el('li', found[i] ? 'found' + (fresh === i ? ' fresh' : '') : 'open');
      li.appendChild(el('b', null, 'If ')); li.appendChild(document.createTextNode(r.if + ', '));
      li.appendChild(el('b', null, 'then ')); li.appendChild(found[i] ? document.createTextNode(r.then) : el('i', null, 'make it happen and see.'));
      ul.appendChild(li);
    });
    rulesEl.appendChild(ul);
    if (found.every(Boolean) && ex.meet) rulesEl.appendChild(el('p', 'ex-meet', ex.meet));
  }
  const total = () => ex.choices.reduce((a, c) => a + choices[c.id], 0);
  function checkRules(replayDone) {
    let fresh = -1;
    ex.rules.forEach((r, i) => {
      if (found[i]) return;
      const w = r.when || {};
      let ok = false;
      if (w.replay) ok = !!replayDone;
      else if (mode === 'run') {
        const inC = Object.entries(w.choices || {}).every(([id, [a, b]]) => choices[id] >= a - 1e-9 && choices[id] <= b + 1e-9);
        const inT = !w.total || (total() >= w.total[0] - 1e-9 && total() <= w.total[1] + 1e-9);
        ok = inC && inT && state.year - seg.year >= (w.years || 1) - 1e-6;
      }
      if (ok) { found[i] = true; fresh = i; if (key) remember(key + '/' + i); }
    });
    if (fresh >= 0) { renderRules(fresh); root.classList.toggle('all', found.every(Boolean)); }
  }

  // ----- the clock
  let last = 0;
  function tick(t) {
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    if (playing) {
      if (mode === 'replay') {
        replayYear += dt * speed;
        const n = now(); setFaders(n.flows, true);
        if (replayYear >= ex.clock.now + 0.999) { replayYear = ex.clock.now; playing = false; checkRules(true); stopReplay(); }
      } else {
        const yrs = Math.min(dt * speed, ex.clock.to - state.year);
        const before = Math.floor(state.year);
        model.step(state, choices, yrs);
        if (Math.floor(state.year + 1e-6) !== before) runTrace.push([Math.floor(state.year + 1e-6), snap()]);
        checkRules(false);
        if (guessRun && state.year >= guessRun.end - 1e-6) finishGuess();
        if (state.year >= ex.clock.to - 1e-6) playing = false;
      }
      paintAll();
    }
    if (world) world.frame(dt, playing ? speed : 0, now());
    raf = requestAnimationFrame(tick);
  }
  let raf = 0;
  const snap = () => Object.fromEntries(ex.stores.map((x) => [x.id, model.shown(state, x.id)]));
  function toToday(keepChoices) {
    playing = false; mode = 'today'; guessRun = null; state = model.start(); runTrace = [[state.year, snap()]]; seg = { year: state.year, key: '' };
    if (!keepChoices) ex.choices.forEach((c) => { choices[c.id] = c.start; });
    setFaders(choices, false); paintAll();
  }
  function stopReplay() { mode = 'today'; state = model.start(); runTrace = [[state.year, snap()]]; setFaders(choices, false); btn('replay').classList.remove('on'); paintAll(); }
  btn('play').onclick = () => {
    if (playing) { playing = false; paintAll(); return; }
    if (mode !== 'replay') { if (mode === 'today') { mode = 'run'; seg = { year: state.year, key: JSON.stringify(choices) }; } if (state.year >= ex.clock.to - 1e-6) toToday(true), (mode = 'run'); }
    playing = true; paintAll();
  };
  btn('replay').onclick = () => { playing = true; mode = 'replay'; replayYear = ex.clock.from; btn('replay').classList.add('on'); paintAll(); };
  btn('today').onclick = () => toToday(false);
  root.querySelectorAll('[data-speed]').forEach((b) => { b.onclick = () => { speed = Number(b.dataset.speed); paintAll(); }; });

  // ----- guess first: the stage stays shut until the learner commits; then it plays the guess out and states the gap
  const gbox = stage.querySelector('.ex-guess');
  if (ex.guess && gbox) {
    gbox.querySelectorAll('[data-i]').forEach((b) => {
      b.onclick = () => {
        guessed = Number(b.dataset.i);
        gbox.hidden = true; root.classList.add('opened');
        toToday(false); Object.assign(choices, ex.guess.set); setFaders(choices, false);
        mode = 'run'; seg = { year: state.year, key: JSON.stringify(choices) };
        guessRun = { from: model.shown(state, main.id), end: state.year + ex.guess.years };
        speed = 10; playing = true; paintAll();
      };
    });
  } else root.classList.add('opened');
  function finishGuess() {
    playing = false; speed = 3;
    const to = model.shown(state, main.id), said = ex.guess.options[guessed];
    const gap = M.say(ex.guess.after, { from: guessRun.from, to });
    guessRun = null;
    const g = root.querySelector('.ex-gap'); g.hidden = false;
    const hold = model.holding(ex.hold ? ex.hold.store : main.id, ex.hold ? ex.hold.choices : null, choices);
    g.textContent = 'You said: ' + said.toLowerCase() + '. ' + gap + ' ' + M.say(ex.say.hold, Object.assign({ total: Object.values(hold).reduce((a, b) => a + b, 0), now: total() }, hold));
    paintAll();
  }

  // ----- the parts: a press shows what the part is, its live number and its source, and lights it on the stage
  let picked = null;
  function pick(id) {
    picked = id;
    parts.forEach((b) => b.classList.toggle('on', b.dataset.part === id));
    const p = ex.stores.find((x) => x.id === id) || ex.flows.find((x) => x.id === id);
    if (!p) { card.hidden = true; if (world) world.light(null); return; }
    card.hidden = false; card.textContent = '';
    card.appendChild(el('b', null, p.name));
    card.appendChild(el('p', null, p.words));
    const src = (p.src || []).map((k) => ex.sources[k]).filter(Boolean).map((s) => s.by + ', ' + s.year).join('; ');
    if (src) card.appendChild(el('small', null, 'From: ' + src));
    const x = el('button', 'ex-x', 'Close'); x.type = 'button'; x.title = 'Close this card'; x.onclick = () => pick(null); card.appendChild(x);
    if (world) world.light(id);
  }
  parts.forEach((b) => { b.onclick = () => pick(picked === b.dataset.part ? null : b.dataset.part); });

  // ----- the 3D world
  let world = null;
  try { world = (ex.world === 'basin' ? basin : globe)({ ex, canvas, stage, labelBox, model, pick: (id) => pick(id) }); } catch (e) { console.error(e); world = null; }
  if (!world) {
    stage.classList.add('flat');
    stage.querySelector('.ex-hint').textContent = 'This device cannot draw the 3D world. Every number, part and setting is here beside it.';
  }
  window.addEventListener('resize', () => { if (world) world.size(); paintAll(); });
  toToday(false); renderRules(-1);
  // run only while the stage is on screen
  new IntersectionObserver((es) => { const on = es.some((e) => e.isIntersecting); if (on && !raf) { last = 0; raf = requestAnimationFrame(tick); } else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; } }).observe(root);

  // for checks: the state, and a way to set choices and run years at once
  root._ex = {
    state: () => ({ mode, year: now().year, value: now().stores[main.id], choices: { ...choices }, found: found.slice(), playing, guessed }),
    run(set, years) { toToday(true); Object.assign(choices, set || {}); setFaders(choices, false); mode = 'run'; seg = { year: state.year, key: JSON.stringify(choices) }; for (let i = 0; i < years; i++) { model.step(state, choices, 1); runTrace.push([Math.floor(state.year + 1e-6), snap()]); } checkRules(false); paintAll(); return model.shown(state, main.id); },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The globe: the Earth from space. Its store is a shell of specks in the air (one speck per `each` of the store's
// model unit), pale for what was there before (the store's base) and hot for what was added. Each flow is specks
// rising out of, or sinking into, the land or the sea within its site's band of latitude, at its real yearly rate.
function globe({ ex, canvas, stage, labelBox, model, pick }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020308);
  const cam = new THREE.PerspectiveCamera(34, 16 / 10, 0.05, 200);
  const main = ex.stores[0];

  // light: one sun, a faint fill so the night side keeps its shape
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.6); sun.position.set(-4.2, 1.4, 2.2); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x3a4a70, 0x05060a, 0.22));

  // stars, far away
  { const n = 2400, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(80); p.set([v.x, v.y, v.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfc8e8, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.7 }))); }

  // the Earth: the picture, with the sea smoother and shinier than the land
  const earth = new THREE.Group(); earth.rotation.z = 0.41; earth.rotation.y = 2.2; scene.add(earth); // 23.4 degree tilt
  const tex = new THREE.TextureLoader();
  const map = tex.load('img/explain/earth.jpg'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const landTex = tex.load('img/explain/land.png');
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.landMap = { value: landTex };
    sh.fragmentShader = 'uniform sampler2D landMap;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.58, 0.97, texture2D(landMap, vMapUv).r);');
  };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), mat); earth.add(ball);

  // the thin blue edge of the air, seen against space
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { sunDir: { value: sun.position.clone().normalize() } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 sunDir; varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(clamp(1.0 + dot(v, vN) * 1.0, 0.0, 1.0), 4.0); float lit = 0.25 + 0.75 * clamp(dot(-vN, sunDir) * 0.5 + 0.6, 0.0, 1.0); gl_FragColor = vec4(vec3(0.32, 0.58, 1.0) * f * lit * 1.6, f); }',
  }));
  scene.add(rim);

  // where flows happen: land or sea cells from the land outline, by latitude band. Filled once the outline loads.
  const cells = { land: [], sea: [] };
  const img = new Image(); img.src = 'img/explain/land.png';
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for (let j = 0; j < c.height; j += 2) for (let i = 0; i < c.width; i += 2) {
      const lat = 90 - (j + 0.5) / c.height * 180, lon = (i + 0.5) / c.width * 360 - 180;
      (d[(j * c.width + i) * 4] > 127 ? cells.land : cells.sea).push([lat, lon]);
    }
    landMask = { w: c.width, h: c.height, d };
  };
  let landMask = null;
  // the same mapping three.js uses for a sphere's picture, so a latitude and longitude land on the right pixel
  function at(lat, lon, r) {
    const phi = (lon + 180) / 360 * Math.PI * 2, th = (90 - lat) / 180 * Math.PI;
    return new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)).multiplyScalar(r);
  }
  const siteCells = (site) => cells[site.on].filter(([lat]) => lat >= site.lat[0] && lat <= site.lat[1]);

  // the store: one speck per `each`, drifting in the air
  const per = main.unit.per, each = ex.each;
  const MAX = Math.ceil((Math.max(...Object.values(ex.history.stores[main.id]), main.start) * 2.2 * per) / each);
  const dir = new Float32Array(MAX * 3), rad = new Float32Array(MAX), spd = new Float32Array(MAX), idx = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { const v = new THREE.Vector3().randomDirection(); dir.set([v.x, v.y, v.z], i * 3); rad[i] = 1.018 + Math.pow(Math.random(), 1.6) * 0.1; spd[i] = (0.02 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1); idx[i] = i; }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); sg.setAttribute('dir', new THREE.BufferAttribute(dir, 3));
  sg.setAttribute('rad', new THREE.BufferAttribute(rad, 1)); sg.setAttribute('spd', new THREE.BufferAttribute(spd, 1)); sg.setAttribute('idx', new THREE.BufferAttribute(idx, 1));
  const specks = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, nShow: { value: 0 }, nBase: { value: 0 }, cBase: { value: new THREE.Color(0xd2defa) }, cAdd: { value: new THREE.Color(0xff4f8b) }, size: { value: 4.2 * Math.min(devicePixelRatio || 1, 2) }, glow: { value: 1 } },
    vertexShader: 'attribute vec3 dir; attribute float rad; attribute float spd; attribute float idx; uniform float time; uniform float nShow; uniform float nBase; uniform vec3 cBase; uniform vec3 cAdd; uniform float size; varying vec3 vC; varying float vA;'
      + 'void main(){ float a = time * spd; float c = cos(a), s = sin(a); vec3 d = vec3(c*dir.x + s*dir.z, dir.y + 0.02*sin(time*0.7+idx), -s*dir.x + c*dir.z); vec4 mv = modelViewMatrix * vec4(normalize(d) * rad, 1.0);'
      + 'vA = clamp(nShow - idx, 0.0, 1.0); vC = idx < nBase ? cBase : cAdd; gl_PointSize = size * (3.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float glow; varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p,p); if (r > 0.25) discard; float k = smoothstep(0.25, 0.0, r); gl_FragColor = vec4(vC * (k * k * 1.5 + k * 0.25) * glow, k * vA); }',
  }));
  specks.frustumCulled = false; scene.add(specks);

  // the flows: a pool of moving specks, each from the ground (or sea) up into the air, or from the air down into it
  const POOL = 2400, fp = new Float32Array(POOL * 3), fc = new Float32Array(POOL * 3), live = [];
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { size: { value: 6.5 * Math.min(devicePixelRatio || 1, 2) } },
    vertexShader: 'uniform float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (3.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p,p); if (r > 0.25) discard; float k = smoothstep(0.25, 0.0, r); gl_FragColor = vec4(vC * (k * 1.8 + 0.3), k); }',
  });
  const fpts = new THREE.Points(fg, fmat); fpts.frustumCulled = false; earth.add(fpts); // they ride the turning Earth
  const owed = {}; let lit = null;
  function spawn(f, n) {
    const list = siteCells(f.site); if (!list.length) return;
    const tone = new THREE.Color(TONES[f.color] || 0xffffff);
    for (let k = 0; k < n && live.length < POOL; k++) {
      const [lat, lon] = list[(Math.random() * list.length) | 0];
      const jl = lat + (Math.random() - 0.5) * 1.0, jo = lon + (Math.random() - 0.5) * 1.0;
      const ground = at(jl, jo, 1.003), sky = at(jl + (Math.random() - 0.5) * 8, jo + (Math.random() - 0.5) * 8, 1.03 + Math.random() * 0.08);
      const up = !!f.to;
      live.push({ f: f.id, a: up ? ground : sky, b: up ? sky : ground, t: 0, dur: 1.4 + Math.random() * 1.2, c: tone });
    }
  }
  const tmp = new THREE.Vector3();
  function moveFlows(dt) {
    let w = 0;
    for (let i = live.length - 1; i >= 0; i--) { const s = live[i]; s.t += dt / s.dur; if (s.t >= 1) live.splice(i, 1); }
    for (const s of live) {
      const u = s.t, e = u * u * (3 - 2 * u);
      tmp.copy(s.a).lerp(s.b, e); const r = tmp.length(); tmp.normalize().multiplyScalar(r + Math.sin(Math.PI * u) * 0.012);
      fp[w * 3] = tmp.x; fp[w * 3 + 1] = tmp.y; fp[w * 3 + 2] = tmp.z;
      const fade = Math.sin(Math.PI * u) * (lit && lit !== s.f ? 0.25 : 1);
      fc[w * 3] = s.c.r * fade; fc[w * 3 + 1] = s.c.g * fade; fc[w * 3 + 2] = s.c.b * fade; w++;
    }
    fg.setDrawRange(0, w); fg.attributes.position.needsUpdate = true; fg.attributes.color.needsUpdate = true;
  }

  // labels on the world: each flow where it happens, the store above the north pole; a press opens its card
  const labels = [];
  const addLabel = (id, name, pos, onEarth) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.title = 'What is ' + name.toLowerCase() + '? Press to see'; b.onclick = (e) => { e.stopPropagation(); pick(id); }; labelBox.appendChild(b); labels.push({ id, b, pos, onEarth }); };
  addLabel(main.id, main.name, new THREE.Vector3(0, 1.32, 0), false);
  for (const f of ex.flows) if (f.at) addLabel(f.id, f.name, at(f.at[0], f.at[1], 1.06), true);

  // hands: drag turns, the wheel (once the stage is pressed) or a pinch zooms; a press without a drag picks a part
  let yaw = 0.6, pitch = 0.25, dist = 3.6, wantDist = 3.6, focused = false, moved = 0, intro = 1;
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { focused = true; stage.classList.add('live'); canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) { yaw -= dx * 0.006; pitch = clamp(pitch + dy * 0.005, -1.3, 1.3); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) wantDist = clamp(wantDist * pinch / d, 1.45, 7); pinch = d; }
  });
  const up = (e) => {
    const was = pts.has(e.pointerId); pts.delete(e.pointerId); pinch = 0;
    if (was && moved < 6 && e.type === 'pointerup') pickAt(e);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  document.addEventListener('pointerdown', (e) => { if (!stage.contains(e.target)) { focused = false; stage.classList.remove('live'); } });
  stage.addEventListener('wheel', (e) => { if (!focused) return; e.preventDefault(); wantDist = clamp(wantDist * Math.exp(e.deltaY * 0.0012), 1.45, 7); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const k = e.key; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(k)) return; e.preventDefault();
    if (k === 'ArrowLeft') yaw += 0.12; if (k === 'ArrowRight') yaw -= 0.12; if (k === 'ArrowUp') pitch = clamp(pitch - 0.1, -1.3, 1.3); if (k === 'ArrowDown') pitch = clamp(pitch + 0.1, -1.3, 1.3);
    if (k === '+' || k === '=') wantDist = clamp(wantDist * 0.88, 1.45, 7); if (k === '-') wantDist = clamp(wantDist / 0.88, 1.45, 7);
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(e) {
    const b = canvas.getBoundingClientRect(); ndc.set((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObject(ball)[0];
    const want = (kind) => { const p = ex.stores.find((x) => x.pick === kind) || ex.flows.find((x) => x.pick === kind); if (p) pick(p.id); };
    if (hit && hit.uv && landMask) {
      const i = Math.min(landMask.w - 1, Math.floor(hit.uv.x * landMask.w)), j = Math.min(landMask.h - 1, Math.floor((1 - hit.uv.y) * landMask.h));
      want(landMask.d[(j * landMask.w + i) * 4] > 127 ? 'land' : 'sea');
    } else if (ray.ray.distanceToPoint(new THREE.Vector3()) < 1.14) want('air');
    else pick(null);
  }

  function size() {
    const W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return;
    gl.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
  }
  size();

  let t = 0, nNow = null;
  const ndcV = new THREE.Vector3();
  function frame(dt, yearsPerSec, n) {
    nNow = n; t += dt;
    if (!still()) earth.rotation.y += dt * 0.03;
    // the opening move: the camera drifts in from far out
    if (intro > 0) { intro = Math.max(0, intro - dt * 0.45); }
    dist += (wantDist - dist) * Math.min(1, dt * 6);
    const d = dist + intro * intro * 4;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d); cam.lookAt(0, 0, 0);
    // the store's specks follow its value; flows spawn at their real yearly rate on the clock, and keep a slow
    // visible trickle while the clock is stopped, because the flows never stop in the real world
    const u = specks.material.uniforms; u.time.value = still() ? 0 : t;
    const target = n.stores[main.id] * per / each; u.nShow.value += (target - u.nShow.value) * Math.min(1, dt * 4); u.nBase.value = main.base * per / each;
    const rate = yearsPerSec || 0.25;
    for (const f of ex.flows) {
      const v = Math.max(0, n.flows[f.id] || 0) / each * rate * dt; owed[f.id] = (owed[f.id] || 0) + v;
      const k = Math.floor(owed[f.id]); if (k > 0) { spawn(f, Math.min(k, 60)); owed[f.id] -= k; }
    }
    moveFlows(dt);
    gl.render(scene, cam);
    // labels follow their places and hide on the far side
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const L of labels) {
      const p = L.onEarth ? L.pos.clone().applyMatrix4(earth.matrixWorld) : L.pos.clone();
      const facing = L.onEarth ? p.clone().normalize().dot(cam.position.clone().normalize()) > 0.18 : true;
      ndcV.copy(p).project(cam);
      const x = (ndcV.x * 0.5 + 0.5) * W, y = (-ndcV.y * 0.5 + 0.5) * H;
      L.b.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
      L.b.hidden = !facing || x < 0 || y < 0 || x > W || y > H;
      L.b.classList.toggle('on', lit === L.id);
    }
    unstack(labels);
  }
  return {
    frame, size, paint() {},
    light(id) { lit = id; specks.material.uniforms.glow.value = id && id !== main.id ? 0.45 : 1; },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The basin: a river basin as real ground. Its files (made by make/cut-basin.py from NOAA's heights and NASA's Blue
// Marble) sit in ex.map.dir: height.png (metres in red and green, the basin's own catchment and its lakes in blue),
// color.jpg, and basin.json (the box, the rivers traced downhill, each lake's cells). A store with a "lake" is drawn as
// water at the level its measured storage gives; the lake's dry bed above the water shows pale, the ring a falling
// reservoir leaves. Each flow moves along the rivers: "into" a point (every river that drains there), along the
// "river" from one point to another, or rising off a "lake" (evaporation).
function basin({ ex, canvas, stage, labelBox, model, pick }) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c); scene.fog = new THREE.Fog(0x05070c, 1800, 4200);
  const cam = new THREE.PerspectiveCamera(36, 16 / 9, 1, 20000);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.8); sun.position.set(-700, 520, 380); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x241a10, 0.55));
  const dir = ex.map.dir, lift = ex.map.lift || 18;
  let G = null, ground = null, waters = {}, riverPts = null, flowsReady = false;
  const lakeOf = {}; for (const st of ex.stores) if (st.lake) lakeOf[st.lake] = st;
  // km from the box's middle: east is +x, north is -z; heights in km, lifted so the canyons read
  let X = () => 0, Z = () => 0, HT = () => 0;

  const tex = new THREE.TextureLoader();
  const color = tex.load(dir + '/color.jpg'); color.colorSpace = THREE.SRGBColorSpace; color.anisotropy = 8;
  Promise.all([fetch(dir + '/basin.json').then((r) => r.json()), new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = dir + '/height.png'; })]).then(([b, im]) => {
    G = b; const n = b.box.n, cs = b.box.cs;
    const c = document.createElement('canvas'); c.width = n; c.height = n; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, n, n).data;
    const midLat = b.box.latTop - cs * (n - 1) / 2, midLon = b.box.lon0 + cs * (n - 1) / 2;
    const kx = 111.32 * Math.cos(midLat * Math.PI / 180), kz = 110.57;
    X = (lon) => (lon - midLon) * kx; Z = (lat) => -(lat - midLat) * kz;
    const hAt = new Float32Array(n * n), kind = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) { hAt[i] = px[i * 4] * 256 + px[i * 4 + 1] - b.box.offset; const k = px[i * 4 + 2]; kind[i] = k === 200 ? 2 : k > 0 ? 1 : 0; }
    HT = (lat, lon) => { const r = clamp(Math.round((b.box.latTop - lat) / cs), 0, n - 1), cc = clamp(Math.round((lon - b.box.lon0) / cs), 0, n - 1); return Math.max(0, hAt[r * n + cc]) / 1000 * lift; };
    // the ground: one vertex per cell
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
      const i = r * n + cc, lat = b.box.latTop - r * cs, lon = b.box.lon0 + cc * cs;
      pos[i * 3] = X(lon); pos[i * 3 + 1] = Math.max(0, hAt[i]) / 1000 * lift; pos[i * 3 + 2] = Z(lat);
      uv[i * 2] = cc / (n - 1); uv[i * 2 + 1] = 1 - r / (n - 1);
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6); let k = 0;
    for (let r = 0; r < n - 1; r++) for (let cc = 0; cc < n - 1; cc++) { const a = r * n + cc, bb = a + 1, d = a + n, e = d + 1; idx.set([a, d, bb, bb, d, e], k); k += 6; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: color, roughness: 0.93, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float kind;\nvarying float vKind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = kind;');
      sh.fragmentShader = 'varying float vKind;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat edge = smoothstep(0.0, 0.09, min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y)));\ndiffuseColor.rgb *= edge;\nif (vKind < 0.5) diffuseColor.rgb *= 0.2; else if (vKind > 1.5) diffuseColor.rgb = mix(vec3(0.86, 0.82, 0.74), diffuseColor.rgb, 0.12);');
    };
    ground = new THREE.Mesh(g, mat); scene.add(ground);
    // the lakes: one flat square of water per lake cell, raised to the level of the moment
    for (const [name, L] of Object.entries(b.lakes)) {
      const q = new Float32Array(L.cells.length * 18); let w = 0;
      const hx = cs / 2 * kx, hz = cs / 2 * kz;
      for (const i of L.cells) {
        const r = Math.floor(i / n), cc = i % n, x0 = X(b.box.lon0 + cc * cs), z0 = Z(b.box.latTop - r * cs);
        q.set([x0 - hx, 0, z0 - hz, x0 - hx, 0, z0 + hz, x0 + hx, 0, z0 - hz, x0 + hx, 0, z0 - hz, x0 - hx, 0, z0 + hz, x0 + hx, 0, z0 + hz], w); w += 18;
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(q, 3)); wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x2fa6e6, emissive: 0x0b4a6e, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 }));
      scene.add(wm); waters[name] = { mesh: wm, L };
    }
    // the rivers: faint lines on the ground, and a map from each point to the next one downstream
    const key = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4);
    const next = new Map(), pts = new Map();
    for (const line of b.rivers) {
      const arr = line.map((p) => new THREE.Vector3(X(p[1]), HT(p[0], p[1]) + 0.25, Z(p[0])));
      const lg = new THREE.BufferGeometry().setFromPoints(arr);
      scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: 0.35 + Math.min(0.5, (line[0][2] - 3) * 0.25) })));
      line.forEach((p, i) => { pts.set(key(p), { p, v: arr[i] }); if (i < line.length - 1) next.set(key(p), key(line[i + 1])); });
    }
    riverPts = { next, pts, key };
    buildPaths(); flowsReady = true;
    size();
  }).catch((e) => { console.error(e); stage.classList.add('flat'); stage.querySelector('.ex-hint').textContent = 'The map of the basin did not load. Every number, part and setting is here beside it.'; });

  // each flow's routes: lists of points along the rivers
  const routes = {};
  function walk(fromKey, toLatLon, max) {
    const out = []; let k = fromKey, guard = 0;
    while (k && guard++ < (max || 4000)) {
      const P = riverPts.pts.get(k); if (!P) break; out.push(P.v);
      if (toLatLon && Math.hypot(P.p[0] - toLatLon[0], P.p[1] - toLatLon[1]) < 0.06) return out;
      k = riverPts.next.get(k);
    }
    return toLatLon ? null : out;
  }
  const nearest = (ll) => { let best = null, d = 1e9; for (const [k, P] of riverPts.pts) { const e = Math.hypot(P.p[0] - ll[0], P.p[1] - ll[1]); if (e < d) { d = e; best = k; } } return best; };
  function buildPaths() {
    for (const f of ex.flows) {
      const s = f.site;
      if (s.on === 'river') { const p = walk(nearest(s.from), s.to); routes[f.id] = p ? [p] : []; }
      else if (s.on === 'into') {
        // every river head whose water reaches the point, cut where it gets there
        const heads = G.rivers.map((l) => riverPts.key(l[0]));
        routes[f.id] = heads.map((h) => walk(h, s.to)).filter((p) => p && p.length > 4);
      } else routes[f.id] = [];
    }
  }

  // moving water: a pool of specks, each riding a route, or rising off a lake
  const POOL = 5000, fp = new Float32Array(POOL * 3), fc = new Float32Array(POOL * 3), live = [];
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fpts = new THREE.Points(fg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { size: { value: 7 * Math.min(devicePixelRatio || 1, 2) } },
    vertexShader: 'uniform float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * (900.0 / -mv.z), 2.0, 14.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float r = dot(p,p); if (r > 0.25) discard; float k = smoothstep(0.25, 0.0, r); gl_FragColor = vec4(vC * (k * 1.8 + 0.3), k); }',
  }));
  fpts.frustumCulled = false; scene.add(fpts);
  const owed = {}; let lit = null;
  function spawn(f, n) {
    const tone = new THREE.Color(TONES[f.color] || 0xffffff);
    if (f.site.on === 'lake') {
      const W = waters[f.site.lake]; if (!W) return;
      for (let k = 0; k < n && live.length < POOL; k++) {
        const arr = W.mesh.geometry.attributes.position.array, j = ((Math.random() * arr.length / 3) | 0) * 3;
        live.push({ f: f.id, lake: true, x: arr[j], z: arr[j + 2], y0: W.mesh.position.y, t: 0, dur: 2 + Math.random() * 1.5, c: tone });
      }
      return;
    }
    const rs = routes[f.id]; if (!rs || !rs.length) return;
    for (let k = 0; k < n && live.length < POOL; k++) {
      const route = rs[(Math.random() * rs.length) | 0];
      live.push({ f: f.id, route, u: f.site.on === 'into' ? Math.random() * 0.6 : 0, t: 0, speed: 260 / Math.max(60, route.length * 1.6), c: tone });
    }
  }
  function moveFlows(dt) {
    let w = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      if (s.lake) { s.t += dt / s.dur; if (s.t >= 1) { live.splice(i, 1); continue; } }
      else { s.u += dt * s.speed; if (s.u >= 1) { live.splice(i, 1); continue; } }
    }
    for (const s of live) {
      let x, y, z, fade;
      if (s.lake) { x = s.x; z = s.z; y = s.y0 + s.t * 18; fade = Math.sin(Math.PI * s.t) * 0.7; }
      else {
        const L = s.route.length - 1, at = s.u * L, i = Math.min(L - 1, Math.floor(at)), f = at - i, a = s.route[i], b = s.route[i + 1];
        x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f + 0.6; z = a.z + (b.z - a.z) * f; fade = Math.min(1, s.u * 8, (1 - s.u) * 8);
      }
      if (lit && lit !== s.f) fade *= 0.25;
      fp[w * 3] = x; fp[w * 3 + 1] = y; fp[w * 3 + 2] = z;
      fc[w * 3] = s.c.r * fade; fc[w * 3 + 1] = s.c.g * fade; fc[w * 3 + 2] = s.c.b * fade; w++;
    }
    fg.setDrawRange(0, w); fg.attributes.position.needsUpdate = true; fg.attributes.color.needsUpdate = true;
  }

  // labels: each part where it is; a press opens its card
  const labels = [];
  const addLabel = (id, name, ll) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.title = 'What is ' + name.toLowerCase() + '? Press to see'; b.onclick = (e) => { e.stopPropagation(); pick(id); }; labelBox.appendChild(b); labels.push({ id, b, ll }); };
  for (const st of ex.stores) if (st.at) addLabel(st.id, st.name, st.at);
  for (const f of ex.flows) if (f.at) addLabel(f.id, f.name, f.at);

  // hands: drag turns, the wheel (once the stage is pressed) or a pinch zooms; a press on a lake opens its card
  let yaw = 0.35, pitch = 0.78, dist = 1500, wantDist = 1500, focused = false, moved = 0, intro = 1;
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { focused = true; stage.classList.add('live'); canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) { yaw -= dx * 0.005; pitch = clamp(pitch + dy * 0.004, 0.25, 1.45); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) wantDist = clamp(wantDist * pinch / d, 180, 2600); pinch = d; }
  });
  const up = (e) => { const was = pts.has(e.pointerId); pts.delete(e.pointerId); pinch = 0; if (was && moved < 6 && e.type === 'pointerup') pickAt(e); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  document.addEventListener('pointerdown', (e) => { if (!stage.contains(e.target)) { focused = false; stage.classList.remove('live'); } });
  stage.addEventListener('wheel', (e) => { if (!focused) return; e.preventDefault(); wantDist = clamp(wantDist * Math.exp(e.deltaY * 0.0012), 180, 2600); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const k = e.key; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(k)) return; e.preventDefault();
    if (k === 'ArrowLeft') yaw += 0.1; if (k === 'ArrowRight') yaw -= 0.1; if (k === 'ArrowUp') pitch = clamp(pitch - 0.08, 0.25, 1.45); if (k === 'ArrowDown') pitch = clamp(pitch + 0.08, 0.25, 1.45);
    if (k === '+' || k === '=') wantDist = clamp(wantDist * 0.88, 180, 2600); if (k === '-') wantDist = clamp(wantDist / 0.88, 180, 2600);
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(e) {
    const b = canvas.getBoundingClientRect(); ndc.set((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(Object.values(waters).map((w) => w.mesh))[0];
    if (hit) { const name = Object.keys(waters).find((k) => waters[k].mesh === hit.object); if (lakeOf[name]) { pick(lakeOf[name].id); return; } }
    pick(null);
  }

  function size() { const W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return; gl.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); }
  size();
  const tmp = new THREE.Vector3(), look = new THREE.Vector3(0, 20, 60);
  function frame(dt, yearsPerSec, n) {
    if (intro > 0) intro = Math.max(0, intro - dt * 0.4);
    dist += (wantDist - dist) * Math.min(1, dt * 6);
    const d = dist * (1 + intro * intro * 0.8), p = pitch + intro * 0.25;
    cam.position.set(look.x + Math.sin(yaw) * Math.cos(p) * d, look.y + Math.sin(p) * d, look.z + Math.cos(yaw) * Math.cos(p) * d); cam.lookAt(look);
    if (!still() && !pts.size && !focused) yaw += dt * 0.01;
    // the lakes stand at the level their storage gives
    for (const [name, W] of Object.entries(waters)) {
      const st = lakeOf[name]; if (!st) continue;
      const lv = model.levelOf(st.id, n.stores[st.id]); if (!lv) continue;
      const y = lv.ft * 0.3048 / 1000 * lift;
      W.mesh.position.y += (y - W.mesh.position.y) * Math.min(1, dt * 5);
      W.mesh.material.emissive.setHex(lit === st.id ? 0x2a7fb0 : 0x0b4a6e);
    }
    if (flowsReady) {
      const rate = yearsPerSec || 0.25;
      for (const f of ex.flows) {
        const v = Math.max(0, n.flows[f.id] || 0) / ex.each * rate * dt; owed[f.id] = (owed[f.id] || 0) + v;
        const k = Math.floor(owed[f.id]); if (k > 0) { spawn(f, Math.min(k, 80)); owed[f.id] -= k; }
      }
      moveFlows(dt);
    }
    gl.render(scene, cam);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    for (const L of labels) {
      if (!G) { L.b.hidden = true; continue; }
      tmp.set(X(L.ll[1]), HT(L.ll[0], L.ll[1]) + 30, Z(L.ll[0])).project(cam);
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
      L.b.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
      L.b.hidden = tmp.z > 1 || x < 0 || y < 0 || x > W || y > H;
      L.b.classList.toggle('on', lit === L.id);
    }
    unstack(labels);
  }
  return { frame, size, paint() {}, light(id) { lit = id; } };
}

document.querySelectorAll('.ex').forEach(mount);
