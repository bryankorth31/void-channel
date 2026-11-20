// Void University scale stage (19 Nov 2026). A unit can carry "scale" blocks: a list of measured things, drawn in 3D
// at their true size to each other, that you can turn, zoom and walk along. Two kinds:
//   amount: every thing is a solid block whose VOLUME is its number, so twice the amount is twice the block.
//   size:   every thing is drawn as wide as it really is, from a cell to the gap between galaxies. No screen can hold
//           that range at once, so the stage keeps what you look at in the middle and redraws the rest around it at
//           the scale of the moment. A solid thing far too big to fit shows as the wall of its near side.
// The page builder (build.js, scaleBlock) writes the list, the numbers and the sources as plain HTML, so they read
// with no 3D at all; this file draws the stage and wires the list to it. three.js (vendor, MIT) does the drawing.
import * as THREE from './three.module.min.js';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 7500 -> "7,500", 1.667 -> "1.7", 2.2e8 -> "220 million": two figures, said in words once the zeros pile up.
const WORDS = [[1e24, 'million billion billion'], [1e21, 'thousand billion billion'], [1e18, 'billion billion'], [1e15, 'million billion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
function round2(n) {
  for (const [at, word] of WORDS) if (n >= at) return String(Number((n / at).toPrecision(2))) + ' ' + word;
  const v = Number(n.toPrecision(2));
  return v >= 1000 ? v.toLocaleString('en-US') : String(v);
}
const UNIT = 100;   // size kind: the eye always sits this many drawing units from what it looks at
const TOO_BIG = 2e5; // size kind: past this many drawing units a thing can no longer be drawn whole

function mount(root) {
  const cfg = JSON.parse(root.dataset.scale);
  root.classList.add('js');
  const isSize = cfg.kind === 'size';
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
  try { gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: isSize }); } catch (e) { gl = null; }
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

  // ----- how big each thing is drawn. amount: side = cube root of the number, the largest side set to 100.
  //       size: its real width in metres, kept as a full-precision number until the moment of drawing.
  const top = Math.max(...cfg.things.flatMap((t) => Object.values(t.values).filter((v) => v > 0)));
  const sideOf = (v) => (v > 0 ? (isSize ? v : Math.cbrt(v / top) * 100) : 0);
  const box = new THREE.BoxGeometry(1, 1, 1), edge = new THREE.EdgesGeometry(box);
  const ball = new THREE.SphereGeometry(0.5, 48, 32);
  const solid = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, transparent: true });
  function shapeOf(t, color) {
    const kind = isSize ? (t.shape || 'ball') : 'box';
    const mat = solid(color);
    if (kind === 'box') {
      const mesh = new THREE.Mesh(box, mat);
      const lines = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.55), transparent: true }));
      mesh.add(lines);
      return { kind, obj: mesh, mat, lines, topH: 0.5 };
    }
    if (kind === 'tall') return { kind, obj: new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.74, 8, 20), mat), mat, topH: 0.5 };
    if (kind === 'disc') { // a thing far wider than it is thick: a galaxy, a red blood cell
      const g = new THREE.Group(), m = new THREE.Mesh(ball, mat), thick = t.thick || 0.03;
      m.scale.set(1, thick, 1); g.add(m); g.rotation.x = 0.42;
      return { kind, obj: g, mat, topH: 0.22 + thick / 2 };
    }
    if (kind === 'ring') { // a path with no thickness of its own: an orbit. The tube is redrawn so it stays a thin line.
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.004, 8, 160), mat); m.rotation.x = Math.PI / 2 - 0.42;
      return { kind, obj: m, mat, topH: 0.22, tube: 0 };
    }
    if (kind === 'bar') { // a distance between two points: a thin rod with a knob at each end
      const g = new THREE.Group(), rod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), mat);
      rod.rotation.z = Math.PI / 2; const a = new THREE.Mesh(ball, mat), b = new THREE.Mesh(ball, mat);
      g.add(rod, a, b);
      return { kind, obj: g, mat, rod, ends: [a, b], topH: 0 };
    }
    return { kind: 'ball', obj: new THREE.Mesh(ball, mat), mat, topH: 0.5 };
  }
  const things = cfg.things.map((t, i) => {
    const color = new THREE.Color(t.color);
    const s = shapeOf(t, color); scene.add(s.obj);
    const lab = document.createElement('span'); lab.textContent = t.name; labelBox.appendChild(lab);
    // a thing keeps its place in the row whatever the state shows, so nothing slides when the time changes
    const place = Math.max(...cfg.states.map((st) => sideOf(valueOf(t, st.key) || 0)));
    return { t, i, ...s, color, lab, place, side: 0, from: 0, to: 0, ghost: false, x: 0, shown: false, lx: 0, ly: 0, lz: 0, ls: 0 };
  });
  // The row. amount: the biggest first, each smaller one beside it. size: the smallest first at zero, so the small
  // things keep their exact places and the big ones, far out along the row, lose nothing that could be seen.
  const desc = things.slice().sort((a, b) => b.place - a.place);
  const order = isSize ? desc.slice().reverse() : desc;
  let x = 0;
  order.forEach((o, k) => {
    if (k) { const p = order[k - 1], small = Math.min(p.place, o.place), large = Math.max(p.place, o.place); x += p.place / 2 + o.place / 2 + (isSize ? 0.35 * small : 0.3 * small + 0.04 * large); }
    // size: bigger things run off to the left, behind what you look at, so the eye (which starts on the right)
    // never ends up inside a giant neighbour
    o.x = isSize ? -x : x;
  });
  const big = desc[0];
  const lo = Math.min(...things.map((o) => o.x - o.place / 2)), hi = Math.max(...things.map((o) => o.x + o.place / 2));
  const rowMid = (lo + hi) / 2, rowWide = hi - lo;
  if (!isSize) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(rowWide * 30, rowWide * 30), new THREE.MeshBasicMaterial({ color: 0x10131c }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(rowMid, -0.001, 0); scene.add(ground);
  }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
  wall.rotation.y = -Math.PI / 2; wall.scale.setScalar(TOO_BIG * 4); wall.visible = false; scene.add(wall);
  let walled = null;

  // ----- the view: a point looked at, a distance, and two angles (all in the row's own measure)
  const view = { tx: rowMid, ty: 0, tz: 0, dist: 300, az: 0.5, pol: 1.15 };
  let fly = null, grow = null, need = true, running = false, picked = -1;
  const fitDist = () => (rowWide / 2) / (Math.tan(cam.fov * Math.PI / 360) * cam.aspect) * 1.12 + big.place * 0.6;
  const minDist = () => Math.min(...things.map((o) => o.place)) * 1.6;
  const maxDist = () => fitDist() * 1.8;
  function all() { return { tx: rowMid, ty: isSize ? 0 : big.place * 0.25, tz: 0, dist: fitDist(), az: 0.5, pol: 1.15 }; }
  function near(o) { const s = Math.max(o.side, o.place * 0.6); return { tx: o.x, ty: isSize ? 0 : s / 2, tz: 0, dist: Math.max(minDist(), s * 4.6), az: view.az, pol: clamp(view.pol, 0.9, 1.3) }; }
  function go(to, ms) {
    if (still() || !ms) { Object.assign(view, to); fly = null; need = true; kick(); return; }
    fly = { a: { ...view }, b: to, t0: performance.now(), ms }; kick();
  }
  function place() {
    const sp = Math.sin(view.pol), cp = Math.cos(view.pol);
    if (isSize) {
      cam.position.set(UNIT * sp * Math.sin(view.az), UNIT * cp, UNIT * sp * Math.cos(view.az));
      cam.near = 0.05; cam.far = TOO_BIG * 40; cam.updateProjectionMatrix(); cam.lookAt(0, 0, 0);
      return;
    }
    cam.position.set(view.tx + view.dist * sp * Math.sin(view.az), Math.max(0.02 * view.dist, view.ty + view.dist * cp), view.tz + view.dist * sp * Math.cos(view.az));
    cam.near = view.dist * 0.01; cam.far = view.dist * 40 + rowWide * 4; cam.updateProjectionMatrix();
    cam.lookAt(view.tx, view.ty, view.tz);
  }
  // Put every thing where the eye will find it. amount: its own place on the ground. size: its place and width
  // measured from the point looked at and shrunk to drawing units, so the numbers handed to the picture stay small.
  function sync() {
    if (!isSize) {
      things.forEach((o) => {
        o.shown = o.side > 0.0001; o.obj.visible = o.shown;
        o.obj.scale.setScalar(Math.max(o.side, 0.0001)); o.obj.position.set(o.x, o.side / 2, 0);
        o.lx = o.x; o.ly = o.side; o.lz = 0; o.ls = o.side;
      });
      return;
    }
    const k = UNIT / view.dist;
    walled = null;
    things.forEach((o) => {
      const s = o.side * k, px = (o.x - view.tx) * k, py = -view.ty * k, pz = -view.tz * k;
      o.shown = false; o.obj.visible = false;
      if (s < 0.02) return;
      if (o.kind === 'bar') {
        const x0 = Math.max(px - s / 2, -TOO_BIG), x1 = Math.min(px + s / 2, TOO_BIG);
        if (x1 - x0 < 0.02 || Math.abs(py) > TOO_BIG || Math.abs(pz) > TOO_BIG) return;
        o.obj.visible = o.shown = true; o.obj.position.set(0, 0, 0); o.obj.scale.setScalar(1);
        o.rod.position.set((x0 + x1) / 2, py, pz); o.rod.scale.set(0.5, x1 - x0, 0.5);
        o.ends[0].visible = px - s / 2 > -TOO_BIG; o.ends[0].position.set(x0, py, pz); o.ends[0].scale.setScalar(1.6);
        o.ends[1].visible = px + s / 2 < TOO_BIG; o.ends[1].position.set(x1, py, pz); o.ends[1].scale.setScalar(1.6);
        o.lx = clamp(px, x0, x1); if (Math.abs(o.lx) > 60) o.lx = clamp(0, x0, x1); o.ly = py + 1.2; o.lz = pz; o.ls = Math.min(x1 - x0, 60);
        return;
      }
      if (s > TOO_BIG || Math.abs(px) > TOO_BIG * 6) {
        // only a solid thing has a near side to show; the nearest such wall hides every bigger one behind it
        if ((o.kind === 'ball' || o.kind === 'tall') && s > TOO_BIG && (!walled || o.x > walled.x)) walled = o;
        return;
      }
      o.obj.visible = o.shown = true; o.obj.position.set(px, py, pz); o.obj.scale.setScalar(s);
      if (o.kind === 'ring') { const tube = clamp(0.3 / s, 1e-7, 0.05); if (Math.abs(tube - o.tube) > o.tube * 0.04) { o.obj.geometry.dispose(); o.obj.geometry = new THREE.TorusGeometry(0.5, tube, 8, 160); o.tube = tube; } }
      o.lx = px; o.ly = py + o.topH * s; o.lz = pz; o.ls = s;
    });
    wall.visible = false;
    if (walled) {
      const wx = (walled.x + walled.side / 2 - view.tx) * k;
      if (Math.abs(wx) < TOO_BIG * 6) {
        wall.visible = true; wall.position.set(wx, -view.ty * k, -view.tz * k); wall.material.color.copy(walled.color);
        walled.shown = true; walled.lx = wx; walled.ly = 0; walled.lz = 0; walled.ls = 1e6;
      } else walled = null;
    }
  }
  function setState(st, ms) {
    state = st; paintRows();
    things.forEach((o) => {
      const v = valueOf(o.t, st);
      o.from = o.side; o.ghost = v === null;
      // no measured number for this time: keep today's size, drawn faintly
      o.to = sideOf(v === null ? valueOf(o.t, cfg.states[0].key) || 0 : v);
    });
    grow = { t0: performance.now(), ms: still() ? 0 : ms }; kick(); tell();
  }
  function tell() {
    if (picked < 0) { readout.textContent = cfg.hint; return; }
    const o = things[picked], v = valueOf(o.t, state), row = rows[picked];
    const base = cfg.base ? cfg.things.find((t) => t.name === cfg.base.name) : null, bv = base ? valueOf(base, state) : null;
    let s = o.t.name + ': ' + (row.dataset['v' + state] || '') + '.';
    if (v > 0 && bv > 0 && base !== o.t) s += v >= bv ? ' That is ' + round2(v / bv) + ' times ' + cfg.base.words + '.' : ' ' + cfg.base.cap + ' ' + (cfg.base.verb || 'come to') + ' ' + round2(bv / v) + ' times this.';
    if (o.t.more) s += ' ' + o.t.more;
    readout.textContent = s;
  }
  function pick(i, ms) {
    picked = i; rows.forEach((r, k) => r.classList.toggle('on', k === i));
    things.forEach((o) => {
      if (o.lines) o.lines.material.color.set(o.i === i ? 0xffffff : o.color.clone().lerp(new THREE.Color(0xffffff), 0.55));
      else o.mat.emissive.set(o.i === i ? 0x2a2a2a : 0x000000);
    });
    tell();
    if (i >= 0) go(near(things[i]), ms === undefined ? 900 : ms); else go(all(), 900);
  }

  // ----- names float over the things that are big enough on screen to carry one
  const v3 = new THREE.Vector3();
  function names(w, h) {
    const taken = [];
    const f = h / 2 / Math.tan(cam.fov * Math.PI / 360);
    things.map((o) => {
      if (!o.shown) return { o, px: 0, sx: 0, sy: 0, z: 2 };
      v3.set(o.lx, o.ly, o.lz); const d = v3.distanceTo(cam.position); v3.project(cam);
      return { o, px: o.ls / d * f, sx: (v3.x + 1) / 2 * w, sy: (1 - v3.y) / 2 * h, z: v3.z };
    }).sort((a, b) => (b.o.i === picked) - (a.o.i === picked) || b.px - a.px).forEach((p) => {
      const wide = p.o.t.name.length * 7.4 + 16;
      const r = { l: p.sx - wide / 2, r: p.sx + wide / 2, t: p.sy - 30, b: p.sy - 4 };
      const ok = p.o.shown && p.px > 22 && p.z < 1 && r.l > 4 && r.r < w - 4 && r.t > 4 && r.b < h - 4 && !taken.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
      p.o.lab.style.display = ok ? '' : 'none';
      if (ok) { taken.push(r); p.o.lab.style.transform = 'translate(' + Math.round(p.sx) + 'px,' + Math.round(p.sy - 8) + 'px) translate(-50%,-100%)'; p.o.lab.classList.toggle('on', p.o.i === picked); }
    });
  }

  function frame(now) {
    running = false;
    let more = false;
    if (fly) {
      const k = clamp((now - fly.t0) / fly.ms, 0, 1), e = ease(k);
      view.dist = Math.exp(Math.log(fly.a.dist) + (Math.log(fly.b.dist) - Math.log(fly.a.dist)) * e);
      // the point looked at moves in step with the distance itself, so a long trip pulls back first and then
      // travels, or travels and then closes in, and never stares at empty space half way
      const span = fly.b.dist - fly.a.dist, m = Math.abs(span) > 1e-9 * fly.b.dist ? clamp((view.dist - fly.a.dist) / span, 0, 1) : e;
      for (const key of ['tx', 'ty', 'tz']) view[key] = fly.a[key] + (fly.b[key] - fly.a[key]) * m;
      for (const key of ['az', 'pol']) view[key] = fly.a[key] + (fly.b[key] - fly.a[key]) * e;
      if (k < 1) more = true; else { Object.assign(view, fly.b); fly = null; }
      need = true;
    }
    if (grow) {
      const k = grow.ms ? clamp((now - grow.t0) / grow.ms, 0, 1) : 1, e = ease(k);
      things.forEach((o) => {
        o.side = o.from + (o.to - o.from) * e;
        o.mat.opacity = o.ghost ? 0.12 : 1; o.mat.depthWrite = !o.ghost; if (o.lines) o.lines.material.opacity = o.ghost ? 0.5 : 1;
      });
      if (k < 1) more = true; else grow = null;
      need = true;
    }
    if (need) {
      need = false;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w && h) {
        if (canvas.width !== Math.round(w * gl.getPixelRatio()) || canvas.height !== Math.round(h * gl.getPixelRatio())) { gl.setSize(w, h, false); cam.aspect = w / h; }
        sync(); place(); gl.render(scene, cam); names(w, h);
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
    const k = view.dist * 0.0016, reach = isSize ? view.dist * 3 : big.place * 1.5;
    view.tx = clamp(view.tx - (Math.cos(view.az) * dx + Math.sin(view.az) * dy) * k, lo - big.place, hi + big.place);
    view.tz = clamp(view.tz - (-Math.sin(view.az) * dx + Math.cos(view.az) * dy) * k, -reach, reach);
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
      else { view.az -= dx * 0.008; view.pol = clamp(view.pol - dy * 0.006, 0.12, isSize ? 3.02 : 1.5); }
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
  stage.addEventListener('wheel', (e) => { if (!focused) return; e.preventDefault(); zoomBy(Math.exp(e.deltaY * (isSize ? 0.004 : 0.0014))); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const k = e.key; let hit = true;
    if (k === 'ArrowLeft') view.az += 0.12; else if (k === 'ArrowRight') view.az -= 0.12;
    else if (k === 'ArrowUp') view.pol = clamp(view.pol - 0.08, 0.12, 1.5); else if (k === 'ArrowDown') view.pol = clamp(view.pol + 0.08, 0.12, 1.5);
    else if (k === '+' || k === '=') zoomBy(0.8); else if (k === '-') zoomBy(1.25); else if (k === 'Home') pick(-1); else hit = false;
    if (hit) { e.preventDefault(); fly = null; redraw(); }
  });
  // Bigger and Smaller walk the things in order of size, whichever way the row runs
  const step = (d) => { const k = picked < 0 ? (d > 0 ? 0 : desc.length - 1) : clamp(desc.indexOf(things[picked]) + d, 0, desc.length - 1); pick(desc[k].i, isSize ? 1700 : 900); };
  const tool = { in: () => zoomBy(isSize ? 0.5 : 0.72), out: () => zoomBy(isSize ? 2 : 1.4), all: () => pick(-1), bigger: () => step(-1), smaller: () => step(1) };
  root.querySelectorAll('.scale-tools button').forEach((b) => { b.onclick = () => tool[b.dataset.do](); });
  rows.forEach((r, i) => { r.onclick = () => pick(i, isSize ? 1700 : 900); });
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
  root.scaleStage = { things: things.map((o) => ({ name: o.t.name, x: o.x, side: () => o.side, shown: () => o.shown, drawn: () => o.ls })), view, state: () => state, pick, setState, wall: () => (wall.visible && walled ? walled.t.name : null) };
}

document.querySelectorAll('.scale').forEach(mount);
