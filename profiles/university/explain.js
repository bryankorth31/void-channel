// Void University explainers: the stage (22 Nov 2026). A unit's "explainer" block is a real system built in 3D from
// its data file: stores that fill and drain, the flows between them, the choices people argue about as faders, and
// the measured years to replay. explain-model.js does the arithmetic (the same code the tests run); this file draws
// the world, wires the hands to it, and keeps the guess, the rules you find, the line under the stage and the trace.
// The page builder (build.js, explainBlock) writes the parts, their words, the faders and the sources as plain HTML,
// so all of it reads and works with no 3D at all.
// A world is drawn by kind: "globe" is the Earth from space (NASA Blue Marble, with Natural Earth's land outline to
// tell land from sea), with the store as specks in the air and each flow as specks rising from or sinking into the
// ground or the sea where that flow happens. three.js (vendor, MIT) does the drawing.
import * as THREE from './three.module.min.js';

const M = window.VUExplainModel;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TONES = { hot: 0xff4f8b, amber: 0xffb347, cold: 0x5fd4ff, green: 0x6fe39a, gold: 0xffc44d, violet: 0x9b8cf0 };
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

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
  const found = ex.rules.map(() => false);
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
    const hist = Object.entries(ex.history.stores[main.id]).map(([y, v]) => [Number(y), v]);
    const all = hist.map((p) => p[1]).concat(runTrace.map((p) => p[1]), [main.base]);
    const lo = Math.floor(Math.min(...all) / 50) * 50, hi = Math.max(Math.ceil(Math.max(...all) / 50) * 50, lo + 100);
    const L = 34, R = 8, T = 8, B = 18;
    const X = (y) => L + (y - ex.clock.from) / (ex.clock.to - ex.clock.from) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    tctx.font = '11px system-ui, sans-serif'; tctx.fillStyle = 'rgba(220,224,240,.7)'; tctx.strokeStyle = 'rgba(255,255,255,.08)'; tctx.lineWidth = 1;
    for (let v = lo; v <= hi; v += (hi - lo > 300 ? 100 : 50)) { tctx.beginPath(); tctx.moveTo(L, Y(v)); tctx.lineTo(W - R, Y(v)); tctx.stroke(); tctx.fillText(String(v), 2, Y(v) + 4); }
    for (const y of [ex.clock.from, ex.clock.now, ex.clock.to]) tctx.fillText(String(y), clamp(X(y) - 14, L, W - 32), H - 4);
    tctx.setLineDash([4, 4]); tctx.strokeStyle = 'rgba(200,210,230,.45)'; tctx.beginPath(); tctx.moveTo(L, Y(main.base)); tctx.lineTo(W - R, Y(main.base)); tctx.stroke(); tctx.setLineDash([]);
    tctx.fillText('before coal and oil', L + 4, Y(main.base) - 4);
    const path = (pts, color, w) => { if (pts.length < 2) return; tctx.strokeStyle = color; tctx.lineWidth = w; tctx.beginPath(); pts.forEach(([y, v], i) => (i ? tctx.lineTo(X(y), Y(v)) : tctx.moveTo(X(y), Y(v)))); tctx.stroke(); };
    path(hist.filter(([y]) => mode !== 'replay' || y <= replayYear), '#f6f7fb', 2);
    path(runTrace, '#ff4f8b', 2.5);
    const cx = X(n.year), cy = Y(n.stores[main.id]);
    tctx.fillStyle = n.measured ? '#f6f7fb' : '#ff4f8b'; tctx.beginPath(); tctx.arc(cx, cy, 4, 0, 7); tctx.fill();
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
      if (ok) { found[i] = true; fresh = i; }
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
        if (Math.floor(state.year + 1e-6) !== before) runTrace.push([Math.floor(state.year + 1e-6), model.shown(state, main.id)]);
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
  function toToday(keepChoices) {
    playing = false; mode = 'today'; guessRun = null; state = model.start(); runTrace = [[state.year, model.shown(state, main.id)]]; seg = { year: state.year, key: '' };
    if (!keepChoices) ex.choices.forEach((c) => { choices[c.id] = c.start; });
    setFaders(choices, false); paintAll();
  }
  function stopReplay() { mode = 'today'; state = model.start(); runTrace = [[state.year, model.shown(state, main.id)]]; setFaders(choices, false); btn('replay').classList.remove('on'); paintAll(); }
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
    g.textContent = 'You said: ' + said.toLowerCase() + '. ' + gap + ' ' + M.say(ex.say.hold, { total: Object.values(model.holding(main.id)).reduce((a, b) => a + b, 0), now: total() });
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
  try { world = globe({ ex, canvas, stage, labelBox, model, pick: (id) => pick(id) }); } catch (e) { world = null; }
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
    run(set, years) { toToday(true); Object.assign(choices, set || {}); setFaders(choices, false); mode = 'run'; seg = { year: state.year, key: JSON.stringify(choices) }; for (let i = 0; i < years; i++) { model.step(state, choices, 1); runTrace.push([Math.floor(state.year + 1e-6), model.shown(state, main.id)]); } checkRules(false); paintAll(); return model.shown(state, main.id); },
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
  }
  return {
    frame, size, paint() {},
    light(id) { lit = id; specks.material.uniforms.glow.value = id && id !== main.id ? 0.45 : 1; },
  };
}

document.querySelectorAll('.ex').forEach(mount);
