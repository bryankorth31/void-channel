// Void University scale stage (19 Nov 2026). A unit can carry a "scale" block: a list of measured things, drawn in 3D
// at their true size to each other, that you can turn, zoom and walk along. The first kind is "amount": every thing is
// a solid block whose VOLUME is its number, so twice the amount is twice the block, never twice the side.
// The page builder (build.js, scaleBlock) writes the list, the numbers and the sources as plain HTML, so they read
// with no 3D at all; this file draws the stage and wires the list to it. three.js (vendor, MIT) does the drawing.
import * as THREE from './three.module.min.js';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 7500 -> "7,500", 1.667 -> "1.7", 64285 -> "64,000": two figures, the way the paper reports them.
function round2(n) {
  const v = Number(n.toPrecision(2));
  return v >= 1000 ? v.toLocaleString('en-US') : String(v);
}

function mount(root) {
  const cfg = JSON.parse(root.dataset.scale);
  root.classList.add('js');
  const stage = root.querySelector('.scale-stage');
  const canvas = stage.querySelector('canvas');
  const labelBox = root.querySelector('.scale-labels');
  const readout = root.querySelector('.scale-read');
  const rows = [...root.querySelectorAll('.scale-list button')];
  const stateBtns = [...root.querySelectorAll('.scale-states button')];
  let state = cfg.states[0].key;

  // ----- the list works with or without the stage
  const valueOf = (t, st) => (t.values[st] === undefined ? null : t.values[st]);
  function paintRows() {
    rows.forEach((r, i) => {
      r.querySelector('.v').textContent = r.dataset['v' + state] || '';
      r.classList.toggle('ghost', valueOf(cfg.things[i], state) === null);
    });
    stateBtns.forEach((b) => b.classList.toggle('on', b.dataset.state === state));
    const st = cfg.states.find((s) => s.key === state);
    root.querySelector('.scale-statenote').textContent = st.note || '';
  }

  let gl = null;
  try { gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); } catch (e) { gl = null; }
  if (!gl) {
    stage.classList.add('flat');
    stage.querySelector('.scale-hint').textContent = 'This device cannot draw the 3D stage. Every number is in the list.';
    root.querySelector('.scale-guess').hidden = true; root.classList.add('opened');
    stateBtns.forEach((b) => { b.onclick = () => { state = b.dataset.state; paintRows(); }; });
    paintRows();
    return;
  }
  gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080c);
  const cam = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 5000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2030, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.6, 1.4, 1); scene.add(sun);

  // ----- blocks: side = cube root of the amount, the largest side set to 100
  const top = Math.max(...cfg.things.flatMap((t) => Object.values(t.values).filter((v) => v > 0)));
  const sideOf = (v) => (v > 0 ? Math.cbrt(v / top) * 100 : 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edge = new THREE.EdgesGeometry(box);
  const things = cfg.things.map((t, i) => {
    const color = new THREE.Color(t.color);
    const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, transparent: true }));
    const lines = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.55), transparent: true }));
    mesh.add(lines); scene.add(mesh);
    const lab = document.createElement('span'); lab.textContent = t.name; labelBox.appendChild(lab);
    // a thing keeps its place in the row whatever the state shows, so nothing slides when the time changes
    const place = Math.max(...cfg.states.map((s) => sideOf(valueOf(t, s.key) || 0)));
    return { t, i, mesh, lines, lab, place, side: 0, from: 0, to: 0, ghost: false, x: 0 };
  });
  const order = things.slice().sort((a, b) => b.place - a.place);
  let x = 0;
  order.forEach((o, k) => {
    if (k) { const p = order[k - 1]; x += p.place / 2 + o.place / 2 + 0.3 * o.place + 0.04 * p.place; }
    o.x = x;
  });
  const rowMid = (order[0].x - order[0].place / 2 + order[order.length - 1].x + order[order.length - 1].place / 2) / 2;
  const rowWide = order[order.length - 1].x + order[order.length - 1].place / 2 - (order[0].x - order[0].place / 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(rowWide * 30, rowWide * 30), new THREE.MeshBasicMaterial({ color: 0x10131c }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(rowMid, -0.001, 0); scene.add(ground);

  // ----- the view: a point looked at, a distance, and two angles
  const view = { tx: rowMid, ty: 20, tz: 0, dist: 300, az: 0.5, pol: 1.15 };
  let fly = null, grow = null, need = true, running = false, picked = -1;
  const fitDist = () => (rowWide / 2) / (Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * 1.12 + order[0].place * 0.6;
  const minDist = () => Math.min(...things.map((o) => o.place)) * 1.6;
  const maxDist = () => fitDist() * 1.8;
  function all() { return { tx: rowMid, ty: order[0].place * 0.25, tz: 0, dist: fitDist(), az: 0.5, pol: 1.15 }; }
  function near(o) { const s = Math.max(o.side, o.place * 0.6); return { tx: o.x, ty: s / 2, tz: 0, dist: Math.max(minDist(), s * 4.6), az: view.az, pol: clamp(view.pol, 0.9, 1.3) }; }
  function go(to, ms) {
    if (still() || !ms) { Object.assign(view, to); fly = null; need = true; kick(); return; }
    fly = { a: { ...view }, b: to, t0: performance.now(), ms }; kick();
  }
  function place() {
    const sp = Math.sin(view.pol), cp = Math.cos(view.pol);
    cam.position.set(view.tx + view.dist * sp * Math.sin(view.az), Math.max(0.02 * view.dist, view.ty + view.dist * cp), view.tz + view.dist * sp * Math.cos(view.az));
    cam.near = view.dist * 0.01; cam.far = view.dist * 40 + rowWide * 4; cam.updateProjectionMatrix();
    cam.lookAt(view.tx, view.ty, view.tz);
  }
  function setState(st, ms) {
    state = st; paintRows();
    things.forEach((o) => {
      const v = valueOf(o.t, st);
      o.from = o.side; o.ghost = v === null;
      // no measured number for this time: keep today's size, drawn as an outline only
      o.to = sideOf(v === null ? valueOf(o.t, cfg.states[0].key) || 0 : v);
    });
    grow = { t0: performance.now(), ms: still() ? 0 : ms }; kick(); tell();
  }
  function tell() {
    if (picked < 0) { readout.textContent = cfg.hint; return; }
    const o = things[picked], v = valueOf(o.t, state), row = rows[picked];
    const base = cfg.base ? cfg.things.find((t) => t.name === cfg.base.name) : null, bv = base ? valueOf(base, state) : null;
    let s = o.t.name + ': ' + (row.dataset['v' + state] || '') + '.';
    if (v > 0 && bv > 0 && base !== o.t) s += v >= bv ? ' That is ' + round2(v / bv) + ' times ' + cfg.base.words + '.' : ' ' + cfg.base.cap + ' come to ' + round2(bv / v) + ' times this.';
    if (o.t.more) s += ' ' + o.t.more;
    readout.textContent = s;
  }
  function pick(i, ms) {
    picked = i; rows.forEach((r, k) => r.classList.toggle('on', k === i));
    things.forEach((o) => { o.lines.material.color.set(o.i === i ? 0xffffff : new THREE.Color(o.t.color).lerp(new THREE.Color(0xffffff), 0.55)); });
    tell();
    if (i >= 0) go(near(things[i]), ms === undefined ? 900 : ms); else go(all(), 900);
  }

  // ----- names float over the blocks that are big enough on screen to carry one
  const v3 = new THREE.Vector3();
  function names(w, h) {
    const taken = [];
    const f = h / 2 / Math.tan(cam.fov * Math.PI / 360);
    things.map((o) => {
      v3.set(o.x, o.side, 0); const d = v3.distanceTo(cam.position); v3.project(cam);
      return { o, px: o.side / d * f, sx: (v3.x + 1) / 2 * w, sy: (1 - v3.y) / 2 * h, z: v3.z };
    }).sort((a, b) => b.px - a.px).forEach((p) => {
      const wide = p.o.t.name.length * 7.4 + 16;
      const r = { l: p.sx - wide / 2, r: p.sx + wide / 2, t: p.sy - 30, b: p.sy - 4 };
      const ok = p.o.side > 0 && p.px > 22 && p.z < 1 && r.l > 4 && r.r < w - 4 && r.t > 4 && r.b < h - 4 && !taken.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
      p.o.lab.style.display = ok ? '' : 'none';
      if (ok) { taken.push(r); p.o.lab.style.transform = 'translate(' + Math.round(p.sx) + 'px,' + Math.round(p.sy - 8) + 'px) translate(-50%,-100%)'; p.o.lab.classList.toggle('on', p.o.i === picked); }
    });
  }

  function frame(now) {
    running = false;
    let more = false;
    if (fly) {
      const k = clamp((now - fly.t0) / fly.ms, 0, 1), e = ease(k);
      for (const key of Object.keys(fly.b)) view[key] = key === 'dist' ? Math.exp(Math.log(fly.a.dist) + (Math.log(fly.b.dist) - Math.log(fly.a.dist)) * e) : fly.a[key] + (fly.b[key] - fly.a[key]) * e;
      if (k < 1) more = true; else fly = null;
      need = true;
    }
    if (grow) {
      const k = grow.ms ? clamp((now - grow.t0) / grow.ms, 0, 1) : 1, e = ease(k);
      things.forEach((o) => {
        o.side = o.from + (o.to - o.from) * e;
        o.mesh.visible = o.side > 0.0001;
        o.mesh.scale.setScalar(Math.max(o.side, 0.0001)); o.mesh.position.set(o.x, o.side / 2, 0);
        o.mesh.material.opacity = o.ghost ? 0.12 : 1; o.mesh.material.depthWrite = !o.ghost; o.lines.material.opacity = o.ghost ? 0.5 : 1;
      });
      if (k < 1) more = true; else grow = null;
      need = true;
    }
    if (need) {
      need = false;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w && h) {
        if (canvas.width !== Math.round(w * gl.getPixelRatio()) || canvas.height !== Math.round(h * gl.getPixelRatio())) { gl.setSize(w, h, false); cam.aspect = w / h; }
        place(); gl.render(scene, cam); names(w, h);
      }
    }
    if (more) kick();
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }
  const redraw = () => { need = true; kick(); };

  // ----- hands: one finger or the mouse turns, two fingers or the wheel zoom, two fingers or shift-drag slide
  const pts = new Map();
  let focused = false, pinch = 0, mid = null;
  const zoomBy = (f) => { fly = null; view.dist = clamp(view.dist * f, minDist(), maxDist()); redraw(); };
  function slide(dx, dy) {
    const k = view.dist * 0.0016;
    view.tx = clamp(view.tx - (Math.cos(view.az) * dx + Math.sin(view.az) * dy) * k, order[0].x - order[0].place, order[order.length - 1].x + order[0].place);
    view.tz = clamp(view.tz - (-Math.sin(view.az) * dx + Math.cos(view.az) * dy) * k, -order[0].place * 1.5, order[0].place * 1.5);
  }
  canvas.addEventListener('pointerdown', (e) => {
    focused = true; stage.classList.add('live'); canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.button === 2 });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; fly = null;
    if (pts.size === 1) {
      if (p.shift) slide(dx, dy);
      else { view.az -= dx * 0.008; view.pol = clamp(view.pol - dy * 0.006, 0.12, 1.5); }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch) view.dist = clamp(view.dist * pinch / d, minDist(), maxDist());
      slide(m.x - mid.x, m.y - mid.y); pinch = d; mid = m;
    }
    redraw();
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => { if (!stage.contains(e.target)) { focused = false; stage.classList.remove('live'); } });
  // the wheel zooms only once the stage has been pressed, so scrolling the page past it never gets caught
  stage.addEventListener('wheel', (e) => { if (!focused) return; e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0014)); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const k = e.key; let hit = true;
    if (k === 'ArrowLeft') view.az += 0.12; else if (k === 'ArrowRight') view.az -= 0.12;
    else if (k === 'ArrowUp') view.pol = clamp(view.pol - 0.08, 0.12, 1.5); else if (k === 'ArrowDown') view.pol = clamp(view.pol + 0.08, 0.12, 1.5);
    else if (k === '+' || k === '=') zoomBy(0.8); else if (k === '-') zoomBy(1.25); else if (k === 'Home') pick(-1); else hit = false;
    if (hit) { e.preventDefault(); fly = null; redraw(); }
  });
  const step = (d) => { const k = picked < 0 ? (d > 0 ? 0 : order.length - 1) : clamp(order.indexOf(things[picked]) + d, 0, order.length - 1); pick(order[k].i); };
  const tool = { in: () => zoomBy(0.72), out: () => zoomBy(1.4), all: () => pick(-1), bigger: () => step(-1), smaller: () => step(1) };
  root.querySelectorAll('.scale-tools button').forEach((b) => { b.onclick = () => tool[b.dataset.do](); });
  rows.forEach((r, i) => { r.onclick = () => pick(i); });
  stateBtns.forEach((b) => { b.onclick = () => setState(b.dataset.state, 1100); });
  new ResizeObserver(redraw).observe(stage);

  // ----- guess first: the stage stays covered until you have said what you expect
  const g = root.querySelector('.scale-guess');
  function open(show) {
    g.hidden = true; stage.classList.add('open'); root.classList.add('opened');
    const o = show ? things.find((x) => x.t.name === show) : null;
    if (o) pick(o.i, 1400); else pick(-1);
  }
  if (cfg.guess) {
    g.querySelectorAll('button[data-i]').forEach((b) => {
      b.onclick = () => {
        const right = +b.dataset.i === cfg.guess.answer;
        g.querySelectorAll('button[data-i]').forEach((x) => { x.disabled = true; x.classList.toggle('right', +x.dataset.i === cfg.guess.answer); x.classList.toggle('wrong', x === b && !right); });
        const said = g.querySelector('.said'); said.textContent = (right ? 'Yes. ' : 'Not quite. ') + cfg.guess.after; said.hidden = false;
        g.querySelector('.see').hidden = false; g.querySelector('.see').focus();
      };
    });
    g.querySelector('.see').onclick = () => open(cfg.guess.show);
  } else { g.hidden = true; stage.classList.add('open'); root.classList.add('opened'); }

  Object.assign(view, all());
  setState(state, 0);
  tell();
  redraw();
  // for checking the stage from the browser, and nothing else
  root.scaleStage = { things: things.map((o) => ({ name: o.t.name, x: o.x, side: () => o.side })), view, state: () => state, pick, setState };
}

document.querySelectorAll('.scale').forEach(mount);
