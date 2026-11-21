// THE MACHINE (PLAN-kids-make-it T4, T5; B, 15 Nov 2026: "Machine game"): build a chain-reaction machine on the
// workshop's big board out of everyday things, test it, see what happened, change one thing, test again.
// Browser only. build.js puts THREE, planck, MSIM (scripts/lib/play/make/sim.js) and MJOBS (jobs.js) in the page first.
// The physics is the tested engine: the same build always does the same thing. Nothing here counts or scores: the
// child's own tries sit side by side, and the voice says what happened in one plain sentence.
(function () {
  const S = MSIM, JOBS = MJOBS.JOBS, D = 0.7; // depth of the parts on the board
  const COL = { marble: '#ff5fa2', ball: '#4cc9f0', car: '#ff5fa2', domino: '#ffffff', book: '#2ec4b6', ruler: '#ffd23f', block: '#ffd23f', pillow: '#c9b8ff', shelf: '#c98a4b', floor: '#e8c48a', wall: '#f3dcb4', cup: '#4cc9f0' };
  const NAMES = { book: 'Book', ruler: 'Ruler', block: 'Block', pillow: 'Pillow', domino: 'Domino' };
  let el = null, renderer, scene, camera, board, ui = {}, api = {}, job = null, placed = [], sel = null, tries = [], play = null, raf = 0, meshes = new Map(), drag = null;

  function setup() {
    el = document.createElement('div'); el.id = 'vv-machine';
    el.innerHTML = '<div class="m-card"><button class="ear" aria-label="Say it again">&#128264;</button><p></p></div><div class="m-tries" aria-label="Your tries"></div>'
      + '<div class="m-bar"><div class="m-tray"></div><div class="m-tools"><button data-a="left" aria-label="Turn left">&#8634;</button><button data-a="right" aria-label="Turn right">&#8635;</button><button data-a="back">Back to the tray</button></div><button class="m-test">Test it!</button></div>';
    document.getElementById('vv').appendChild(el);
    ui = { card: el.querySelector('.m-card p'), ear: el.querySelector('.ear'), tries: el.querySelector('.m-tries'), tray: el.querySelector('.m-tray'), tools: el.querySelector('.m-tools'), test: el.querySelector('.m-test') };
    const canvas = document.createElement('canvas'); el.prepend(canvas); ui.canvas = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xf3e2b8, 1.9)); const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(-6, 14, 18); scene.add(sun);
    ui.ear.onclick = () => api.say(ui.card.textContent);
    ui.test.onclick = test;
    ui.tools.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b || !sel || play) return; reset();
      if (b.dataset.a === 'back') { placed = placed.filter((p) => p !== sel); sel = null; redraw(); return; }
      sel.angle = Math.max(-45, Math.min(45, (sel.angle || 0) + (b.dataset.a === 'left' ? 6 : -6))); redraw(); });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    window.addEventListener('resize', () => { if (el.style.display !== 'none') { size(); draw(); } });
  }

  // ---- drawing: every part is a thick piece on the board, outlined in ink
  function partMesh(p) {
    const t = S.THINGS[p.thing], g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: COL[p.thing] || '#ff00ff' });
    const add = (geo, x = 0, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); g.add(m); const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x1b1f3b })); e.position.copy(m.position); g.add(e); };
    if (t.shape === 'circle') { const geo = new THREE.CylinderGeometry(t.r, t.r, D, 20); geo.rotateX(Math.PI / 2); add(geo); }
    else if (t.shape === 'cup') { const w = t.w / 2, h = t.h / 2, s = 0.09; add(new THREE.BoxGeometry(t.w, 2 * s, D), 0, -h + s); add(new THREE.BoxGeometry(2 * s, t.h, D), -w + s, 0); add(new THREE.BoxGeometry(2 * s, t.h, D), w - s, 0); }
    else if (p.thing === 'car') { add(new THREE.BoxGeometry(t.w, t.h, D)); const wg = new THREE.CylinderGeometry(0.16, 0.16, D + 0.1, 12); wg.rotateX(Math.PI / 2); const wm = new THREE.MeshLambertMaterial({ color: 0x1b1f3b }); for (const x of [-0.32, 0.32]) { const w = new THREE.Mesh(wg, wm); w.position.set(x, -t.h / 2, 0); g.add(w); } }
    else add(new THREE.BoxGeometry(t.w, t.h, D));
    g.position.set(p.x, p.y, 0); g.rotation.z = (p.angle || 0) * Math.PI / 180;
    return g;
  }
  function redraw() {
    for (const m of meshes.values()) scene.remove(m); meshes.clear();
    for (const p of job.room) { if (p.thing === 'wall' || p.thing === 'floor') continue; const m = partMesh(p); meshes.set(p, m); scene.add(m); }
    for (const p of placed) { const m = partMesh(p); if (p === sel) m.scale.setScalar(1.08); meshes.set(p, m); scene.add(m); }
    // the selected part glows softly
    if (sel) { const t = S.THINGS[sel.thing], gl = new THREE.Mesh(new THREE.BoxGeometry((t.w || 2 * t.r) + 0.4, (t.h || 2 * t.r) + 0.4, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.45 }));
      gl.position.set(sel.x, sel.y, -D / 2 - 0.12); gl.rotation.z = (sel.angle || 0) * Math.PI / 180; meshes.set('glow', gl); scene.add(gl); }
    ui.tools.style.visibility = sel ? 'visible' : 'hidden';
    ui.tools.querySelectorAll('[data-a=left],[data-a=right]').forEach((b) => b.style.display = sel && S.RESTS[sel.thing] ? 'none' : '');
    trayButtons(); draw();
  }
  function boardMesh() { // the pegboard, the floor strip and the side walls
    const g = new THREE.Group(), peg = new THREE.Mesh(new THREE.BoxGeometry(16.4, 10.4, 0.3), new THREE.MeshLambertMaterial({ color: 0xe9c79a })); peg.position.set(8, 5.2, -D / 2 - 0.3); g.add(peg);
    const dots = new THREE.MeshLambertMaterial({ color: 0xc98a4b }), dg = new THREE.BoxGeometry(0.08, 0.08, 0.05);
    for (let x = 0.5; x < 16; x += 1) for (let y = 0.9; y < 10.2; y += 1) { const d = new THREE.Mesh(dg, dots); d.position.set(x, y, -D / 2 - 0.14); g.add(d); }
    const fl = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.4, D + 0.6), new THREE.MeshLambertMaterial({ color: 0xe8c48a })); fl.position.set(8, 0.2, 0); g.add(fl);
    for (const x of [-0.2, 16.2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10.4, D + 0.6), new THREE.MeshLambertMaterial({ color: 0xf3dcb4 })); w.position.set(x, 5.2, 0); g.add(w); }
    return g;
  }
  function size() { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; const fit = Math.max(15, 19 / camera.aspect); camera.position.set(8, 6.4, fit / (2 * Math.tan(15 * Math.PI / 180)) + 1); camera.lookAt(8, 5.4, 0); camera.updateProjectionMatrix(); } // room above for the card and below for the tray, so the whole board shows
  function draw() { renderer.render(scene, camera); }

  // ---- the tray: what you have
  function left() { const t = job.tray.slice(); for (const p of placed) { const i = t.indexOf(p.thing); if (i >= 0) t.splice(i, 1); } return t; }
  function trayButtons() {
    const n = {}; for (const k of left()) n[k] = (n[k] || 0) + 1;
    ui.tray.innerHTML = Object.keys(n).length ? Object.entries(n).map(([k, c]) => '<button data-k="' + k + '"><i style="background:' + COL[k] + '"></i>' + NAMES[k] + (c > 1 ? ' &times; ' + c : '') + '</button>').join('') : '<span>All your things are on the board.</span>';
    ui.tray.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { if (play) return; reset(); const k = b.dataset.k, x = 8 + (placed.length % 4) * 0.8, p = { thing: k, x, y: 6.5, angle: 0 }; if (S.RESTS[k]) p.y = S.restY(job, k, x, 9); placed.push(p); sel = p; redraw(); say('Drag it into place.'); });
  }

  // ---- dragging: grab the nearest part (big targets), slide it on the board
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function at(e) { const r = ui.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.y] : null; }
  function down(e) {
    if (play) return; const pt = at(e); if (!pt) return;
    let best = null, bd = 1.1; for (const p of placed) { const d = Math.hypot(p.x - pt[0], p.y - pt[1]); if (d < bd) { bd = d; best = p; } }
    if (!best) { if (sel) { sel = null; redraw(); } return; }
    reset(); sel = best; drag = { p: best, dx: best.x - pt[0], dy: best.y - pt[1] }; try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser no longer tracks */ } redraw();
  }
  function move(e) {
    if (!drag) return; const pt = at(e); if (!pt) return; const p = drag.p;
    p.x = +Math.max(0.6, Math.min(15.4, pt[0] + drag.dx)).toFixed(2); p.y = +Math.max(0.8, Math.min(9.6, pt[1] + drag.dy)).toFixed(2);
    if (S.RESTS[p.thing]) p.y = S.restY(job, p.thing, p.x, p.y); else { const q = S.snapFlat(job, placed.filter((o) => o !== p), p.thing, p.x, p.y, p.angle); p.x = q.x; p.y = q.y; }
    const m = meshes.get(p); if (m) m.position.set(p.x, p.y, 0); const gl = meshes.get('glow'); if (gl) gl.position.set(p.x, p.y, gl.position.z); draw();
  }
  function up() { drag = null; }

  // ---- test: run the tested engine, then play the frames back slowly
  function movers() { return job.room.concat(placed).filter((p) => S.THINGS[p.thing].moves && !p.still); }
  function reset() { if (!play || play.running) return; play = null; for (const p of movers()) { const m = meshes.get(p); if (m) { m.position.set(p.x, p.y, 0); m.rotation.z = (p.angle || 0) * Math.PI / 180; } } draw(); }
  function test(quick) {
    if (play && play.running) return; play = null; sel = null; redraw();
    const r = S.run(job, placed.map((p) => ({ ...p }))), mv = movers();
    play = { r, mv, i: 0, tick: 0, running: true }; ui.test.disabled = true; say('Here it goes!');
    const step = () => {
      play.tick++; if (play.tick % 3 === 0) play.i++; // about two-thirds speed: slow enough to watch every step
      const f = r.frames[Math.min(play.i, r.frames.length - 1)];
      f.forEach(([x, y, a], k) => { const m = meshes.get(mv[k]); if (m) { m.position.set(x, y, 0); m.rotation.z = a; } }); draw();
      if (play.i < r.frames.length - 1) raf = requestAnimationFrame(step); else finishTest();
    };
    if (quick === true) { play.i = r.frames.length - 1; play.tick = 0; const f = r.frames[play.i]; f.forEach(([x, y, a], k) => { const mm = meshes.get(mv[k]); if (mm) { mm.position.set(x, y, 0); mm.rotation.z = a; } }); draw(); finishTest(); return; }
    raf = requestAnimationFrame(step);
  }
  function finishTest() {
    const r = play.r; play.running = false; ui.test.disabled = false;
    tries.push({ outcome: r.outcome, say: r.say, snap: placed.map((p) => ({ ...p })) });
    drawTries();
    if (r.outcome === 'done') { const d = api.load(); d.machine = d.machine || {}; d.machine[job.id] = placed.map((p) => ({ ...p })); api.save(d); worked(); }
    else { const line = r.say + ' What will you change?'; card(line); api.say([r.say, 'What will you change?']); }
  }
  function worked() {
    const n = tries.length, line = job.say.done + ' ' + job.say.idea + (n > 1 ? ' Look at your tries: each one taught you something.' : '');
    card(line + ' Want to make it better?', '<div class="m-acts"><button data-x="again">Build it a new way</button>' + '<button data-x="' + JOBS[(JOBS.indexOf(job) + 1) % JOBS.length].id + '">Next machine</button>' + '</div>');
    api.say([job.say.done, job.say.idea, n > 1 ? 'Look at your tries: each one taught you something.' : '', 'Want to make it better? Could it work with fewer things? Try it and see. Then build a little machine at home, with a grown-up.']);
    el.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => { const x = b.dataset.x; if (x === 'again') open(job.id, true); else open(x, true); });
  }
  function card(text, extra) { ui.card.innerHTML = text + (extra || ''); }
  function drawTries() { // the child's own tries, side by side, as little drawings: no score, just what they built
    const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    ui.tries.innerHTML = tries.map((t, i) => '<figure class="' + (t.outcome === 'done' ? 'ok' : '') + '"><svg viewBox="0 -10.5 16 10.5">' + miniParts(t.snap) + '</svg><figcaption>' + (ORD[i] || (i + 1) + 'th') + ' try</figcaption></figure>').join('');
  }
  function miniParts(snap) {
    let h = ''; const box = (p, c) => { const t = S.THINGS[p.thing]; if (t.shape === 'circle') return '<circle cx="' + p.x + '" cy="' + -p.y + '" r="' + t.r + '" fill="' + c + '"/>'; const w = t.w, hh = t.h; return '<rect x="' + (p.x - w / 2) + '" y="' + (-p.y - hh / 2) + '" width="' + w + '" height="' + hh + '" fill="' + c + '" transform="rotate(' + -(p.angle || 0) + ' ' + p.x + ' ' + -p.y + ')"/>'; };
    for (const p of job.room) if (p.thing !== 'wall') h += box(p, p.thing === 'floor' ? '#e8c48a' : '#c9c4b6');
    for (const p of snap) h += box(p, COL[p.thing]);
    return h;
  }

  // ---- open a job
  function open(id, fresh) {
    if (!el) setup();
    job = JOBS.find((j) => j.id === id) || JOBS[0]; tries = []; sel = null; play = null; drawTries();
    const saved = (api.load().machine || {})[job.id];
    placed = !fresh && saved ? saved.map((p) => ({ ...p })) : [];
    for (const c of scene.children.slice()) if (c.type === 'Group' || c.type === 'Mesh') scene.remove(c);
    meshes.clear(); scene.add(boardMesh()); size(); redraw();
    const line = job.say.job + (placed.length ? ' This is the machine you built. Test it, or change it.' : ' Pick something from your tray, drag it into place, then press Test.');
    card(line); api.say(line);
  }
  function say(t) { api.say(t); }
  window.MACHINE = {
    show(a) { api = a; if (!el) setup(); el.style.display = ''; open(a.job || (job && job.id) || JOBS[0].id); },
    hide() { if (el) { el.style.display = 'none'; if (raf) cancelAnimationFrame(raf); } },
    jobs: JOBS.map((j) => j.id),
    _state: () => ({ job: job && job.id, placed, tries: tries.map((t) => t.outcome) }), // for checks in the browser
    _place: (list) => { placed = list.map((p) => ({ ...p })); sel = null; redraw(); },
    _test: () => test(true),
    _screen: (i) => { const p = placed[i], v = new THREE.Vector3(p.x, p.y, 0).project(camera), r = ui.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  };
})();
