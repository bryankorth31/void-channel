// VOID VILLAGE view (PLAN-void-village T4): draws a place from world.js in real 3D with three.js (global THREE,
// scripts/lib/play/vendor/three.min.js). Look "Blocks, bold": flat kids colors, soft daylight and shadows, a thin ink
// edge on every block. Calm camera: drag to turn, pinch or wheel to zoom, it eases to a stop; nothing spins on its own,
// and the page only draws while something is moving (easy on old phones and batteries).
// Browser only. build.js puts COLORS and PLACES (world.js) in the page before this file.
(function () {
  const wrap = document.getElementById('vv'), canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 400);

  // Daylight: a soft sky-and-ground fill, and a warm sun that casts soft shadows.
  scene.add(new THREE.HemisphereLight(0xdff4ff, 0xf3e2b8, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  let group = null, things = {}, center = new THREE.Vector3(), centerGoal = new THREE.Vector3(), zoomBase = 10, size = 10;
  const cam = { angle: 35, tilt: 38, dist: 40, goal: { angle: 35, tilt: 38, dist: 40 } };

  function build(place, tid) {
    if (group) { scene.remove(group); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    group = new THREE.Group();
    const all = place.build();
    const big = all.filter((b) => !b[4]), fine = all.filter((b) => b[4]);
    const geo = new THREE.BoxGeometry(1, 1, 1), m = new THREE.Matrix4(), col = new THREE.Color();
    // Draw one set of voxels (big blocks, or the small ones in models). Hidden voxels are skipped; each voxel is shaded a
    // little darker the more neighbors crowd it from above and the sides (soft corners, like light in a real room).
    function draw(list, unit, outline) {
      const key = (x, y, z) => Math.round(x / unit) + ',' + Math.round(y / unit) + ',' + Math.round(z / unit);
      const have = new Set(list.map((b) => key(b[0], b[1], b[2])));
      const at = (b, dx, dy, dz) => have.has(key(b[0] + dx * unit, b[1] + dy * unit, b[2] + dz * unit));
      const shown = list.filter((b) => !(at(b, 1, 0, 0) && at(b, -1, 0, 0) && at(b, 0, 1, 0) && at(b, 0, -1, 0) && at(b, 0, 0, 1) && at(b, 0, 0, -1)));
      const byKind = {};
      for (const b of shown) (byKind[b[3]] = byKind[b[3]] || []).push(b);
      for (const [kind, items] of Object.entries(byKind)) {
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        if (kind === 'water' || kind === 'glass') { mat.transparent = true; mat.opacity = kind === 'glass' ? 0.7 : 0.85; }
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        const base = new THREE.Color(COLORS[kind] || '#ff00ff');
        items.forEach((b, i) => {
          const sink = kind === 'water' ? 0.15 : 0;
          m.makeScale(unit, unit, unit).setPosition(b[0] + unit / 2, b[1] + unit / 2 - sink, b[2] + unit / 2); mesh.setMatrixAt(i, m);
          let crowd = 0; for (const [dx, dy, dz] of [[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1]]) if (at(b, dx, dy, dz)) crowd++;
          const jitter = 1 + (((Math.round(b[0] / unit) * 73856093) ^ (Math.round(b[1] / unit) * 19349663) ^ (Math.round(b[2] / unit) * 83492791)) % 7) / 300; // a hint of variety, the same every time
          mesh.setColorAt(i, col.copy(base).multiplyScalar(Math.min(1.02, (1 - crowd * 0.035) * jitter)));
        });
        mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; mesh.userData.blocks = items;
        group.add(mesh);
        if (outline && !mat.transparent) { // bold ink outline: the same voxels a little bigger, inside out, in ink
          const ink = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x1b1f3b, side: THREE.BackSide }), items.length);
          items.forEach((b, i) => { m.makeScale(unit * 1.22, unit * 1.22, unit * 1.22).setPosition(b[0] + unit / 2, b[1] + unit / 2, b[2] + unit / 2); ink.setMatrixAt(i, m); });
          group.add(ink);
        }
      }
      return shown;
    }
    // Small voxels (the models): one merged shape with only the outside faces, colored per face, so an ink outline
    // can follow the real corners of each thing (a bed's edge, a lamp's shade) instead of every little cube.
    function drawFine(list, unit, parent) {
      parent = parent || group;
      const key = (x, y, z) => Math.round(x / unit) + ',' + Math.round(y / unit) + ',' + Math.round(z / unit);
      const have = new Set(list.map((b) => key(b[0], b[1], b[2])));
      const at = (b, dx, dy, dz) => have.has(key(b[0] + dx * unit, b[1] + dy * unit, b[2] + dz * unit));
      const FACES = [[1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [-1, 0, 0, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]], [0, 1, 0, [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [0, 0, 1, [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
      const sets = { solid: { pos: [], colr: [] }, clear: { pos: [], colr: [] } };
      for (const b of list) {
        const base = new THREE.Color(COLORS[b[3]] || '#ff00ff'), clear = b[3] === 'glass';
        for (const [dx, dy, dz, q] of FACES) {
          if (at(b, dx, dy, dz)) continue;
          let crowd = 0; for (const [ex, ey, ez] of [[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) if (at(b, ex, ey, ez)) crowd++;
          const c = base.clone().multiplyScalar(1 - crowd * 0.04), S = clear ? sets.clear : sets.solid;
          for (const t of [0, 1, 2, 0, 2, 3]) { const v = q[t]; S.pos.push(b[0] + v[0] * unit, b[1] + v[1] * unit, b[2] + v[2] * unit); S.colr.push(c.r, c.g, c.b); }
        }
      }
      for (const [name, S] of Object.entries(sets)) {
        if (!S.pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(S.colr, 3)); g.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: name === 'clear', opacity: name === 'clear' ? 0.55 : 1 });
        const mesh = new THREE.Mesh(g, mat); mesh.castShadow = name === 'solid'; mesh.receiveShadow = true; parent.add(mesh);
        if (name === 'solid') parent.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x1b1f3b }))); // ink only on real corners
      }
    }
    // indoors (place.smooth), walls and floors are smooth with ink only on real corners; outdoors keeps the block grid
    const shownBig = place.smooth ? (drawFine(big, 1), []) : draw(big, 1, false);
    drawFine(fine, 1 / 8);
    // the things in the place: each its own group, so it can be tapped, lifted and moved
    things = {};
    for (const t of (place.things ? place.things() : [])) {
      const g = new THREE.Group(); g.position.set(t.at[0], t.at[1], t.at[2]); g.userData.thing = t.id;
      if (t.turn) g.rotation.y = t.turn * Math.PI / 2; // a quarter turn: a building facing Mill Road, or one turned round
      things[t.id] = { def: t, group: g, goal: g.position.clone(), model: t.model };
      drawThing(things[t.id]); g.visible = !t.hidden; group.add(g);
    }
    window.vvDrawThing = drawThing;
    function drawThing(th) {
      while (th.group.children.length) { const c = th.group.children.pop(); if (c.geometry) c.geometry.dispose(); }
      // A model may carry its own detail (raw.res cubes to a block; 8 unless it says) and a thing may be drawn bigger (def.scale).
      const raw = MODELS[th.model](th.def.opts || {}), s = (th.def.scale || 1) / (raw.res || 8);
      drawFine(raw.map(([x, y, z, k]) => [x * s, y * s, z * s, k]), s, th.group);
    }
    // thin ink edges on the big blocks (the Blocks bold look): the 12 edges of each, in one draw
    const pts = [], E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    for (const [x, y, z] of shownBig) for (const e of E) pts.push(x + e[0], y + e[1], z + e[2], x + e[3], y + e[4], z + e[5]);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1b1f3b, transparent: true, opacity: 0.35 })));
    scene.add(group);
    // frame the place: center, size, sun and shadow box fitted to it
    const bb = new THREE.Box3().setFromObject(group); bb.getCenter(center); centerGoal.copy(center); size = bb.getSize(new THREE.Vector3()).length();
    sun.position.set(center.x - size * 0.35, center.y + size * 0.9, center.z + size * 0.55); sun.target.position.copy(center);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -size * 0.6; sc.right = sc.top = size * 0.6; sc.near = 1; sc.far = size * 3; sc.updateProjectionMatrix();
    Object.assign(cam.goal, place.view); cam.angle = place.view.angle - 25; cam.dist = place.view.dist * 1.25; cam.tilt = place.view.tilt; zoomBase = place.view.dist; // ease in from a little turn
    startTask(place, tid);
    wake();
  }

  function placeCamera() {
    const a = cam.angle * Math.PI / 180, t = cam.tilt * Math.PI / 180;
    camera.position.set(center.x + Math.sin(a) * Math.cos(t) * cam.dist, center.y + Math.sin(t) * cam.dist, center.z + Math.cos(a) * Math.cos(t) * cam.dist);
    camera.lookAt(center);
  }
  function resize() { const w = wrap.clientWidth, h = wrap.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); wake(); }

  // draw only while easing; stop when still
  let raf = 0;
  function frame() {
    raf = 0; let moving = false;
    for (const k of ['angle', 'tilt', 'dist']) { const d = cam.goal[k] - cam[k]; if (Math.abs(d) > 0.01) { cam[k] += d * 0.12; moving = true; } else cam[k] = cam.goal[k]; }
    if (walk && things.walker) {
      const th = things.walker, p = th.group.position, [tx, tz, line] = walk.queue[0], dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (walk.wait > 0) walk.wait--;
      else if (d < 0.05) { p.x = tx; p.z = tz; walk.queue.shift(); if (line) { show(line); say(line); walk.wait = 170; } if (!walk.queue.length) { const f = walk.then; walk = null; setTimeout(f, 350); } }
      else { const sp = Math.min(d, 0.065); p.x += dx / d * sp; p.z += dz / d * sp; th.group.rotation.y = Math.atan2(dx, dz); walk.t = (walk.t || 0) + 1; p.y = 1 + Math.abs(Math.sin(walk.t * 0.25)) * 0.06; }
      th.goal.copy(p); moving = true;
      if (current && current.town) centerGoal.set(p.x, 1, p.z); // the town is bigger than the screen: the view walks along
    }
    for (const th of Object.values(things)) { const p = th.group.position; if (p.distanceTo(th.goal) > 0.002) { p.lerp(th.goal, 0.14); moving = true; } else p.copy(th.goal); }
    if (center.distanceTo(centerGoal) > 0.002) { center.lerp(centerGoal, 0.1); moving = true; } else center.copy(centerGoal);
    placeCamera(); renderer.render(scene, camera);
    if (moving) wake();
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  // turn and zoom: one finger or mouse drags to turn; two fingers pinch, or the wheel, to zoom
  const ptrs = new Map(); let pinch = 0;
  let press = null;
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser no longer tracks */ } ptrs.set(e.pointerId, [e.clientX, e.clientY]); press = ptrs.size === 1 ? [e.clientX, e.clientY] : null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1 && current && current.town) { // in the town, one finger slides the map (it is bigger than the screen)
      const a = cam.angle * Math.PI / 180, k = cam.dist / Math.max(200, canvas.clientHeight) * 0.8, dx = (e.clientX - px) * k, dy = (e.clientY - py) * k, T = current.town;
      centerGoal.x = Math.max(0, Math.min(T.w, centerGoal.x - Math.cos(a) * dx - Math.sin(a) * dy));
      centerGoal.z = Math.max(0, Math.min(T.d, centerGoal.z + Math.sin(a) * dx - Math.cos(a) * dy));
    } else if (ptrs.size === 1) { cam.goal.angle -= (e.clientX - px) * 0.35; cam.goal.tilt = Math.max(18, Math.min(70, cam.goal.tilt + (e.clientY - py) * 0.25)); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(pinch / d); pinch = d; }
    wake();
  });
  const up = (e) => {
    if (press && e.type === 'pointerup' && Math.hypot(e.clientX - press[0], e.clientY - press[1]) < 8) pick(e.clientX, e.clientY);
    press = null; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const meshes = []; for (const th of Object.values(things)) if (th.group.visible) th.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    // Big targets for small fingers: a tap near a loose thing (or near where the held thing belongs) counts as a tap on
    // it, even when the exact point lands on the rug or floor under it.
    const near = []; const v = new THREE.Vector3(), box = new THREE.Box3();
    for (const id of wanted()) { const th = things[id]; if (!th) continue; box.setFromObject(th.group).getCenter(v); v.project(camera);
      const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top, d = Math.hypot(sx - cx, sy - cy);
      if (d < Math.max(44, r.width * 0.05)) near.push([d, id]); }
    if (near.length) { near.sort((a, b) => a[0] - b[0]); return tapThing(near[0][1]); }
    const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) return;
    let o = hit.object; while (o && !o.userData.thing) o = o.parent; if (o) tapThing(o.userData.thing);
  }
  function wanted() { // the things a tap most likely means: loose things still on the floor, and the home of the one being held
    if (current && current.hub) return Object.keys(current.doors || {});
    if (!task || !state) return [];
    if (task.kind === 'order') { const s = task.steps.find((x) => !state.done[x.id]); return s ? [s.tap] : []; }
    const f = task.steps.find((x) => x.first && !state.done[x.id]); if (f) return [f.item];
    const out = task.steps.filter((s) => !state.done[s.id]).map((s) => s.item);
    if (state.holding) { const s = task.steps.find((x) => x.id === state.holding); if (s) out.push(s.home); }
    return out;
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
  function zoom(f) { const base = zoomBase; cam.goal.dist = Math.max(base * 0.45, Math.min(base * 1.5, cam.goal.dist * f)); wake(); }

  // ---- the task: rules in VT (tasks.js); words on screen and spoken; remembered on this device only ----
  const QUIET = /quiet/.test(location.hash), aud = new Audio(); let q = [];
  function voiceKey(t) { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); }
  function say(lines) { aud.pause(); q = [].concat(lines).filter(Boolean); next(); }
  function next() { if (!q.length) return; const t = q.shift(), k = voiceKey(t); if (QUIET || !VOICE[k]) return next(); aud.src = VBASE + k + '.mp3'; aud.onended = next; aud.onerror = next; aud.play().catch(next); }
  window.vvHush = () => { q = []; aud.pause(); };
  const SAVE = 'voidvillage.v1';
  function load() { try { return JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(SAVE, JSON.stringify(d)); } catch (e) { /* private mode: the village simply forgets */ } }
  const card = document.getElementById('vv-task');
  let task = null, state = null, glowBox = null, last = '', lifted = null;
  function show(text, extra) {
    last = text; card.hidden = !text;
    card.innerHTML = text ? '<button class="ear" aria-label="Say it again">&#128264;</button><p>' + text + '</p>' + (extra || '') : '';
    const ear = card.querySelector('.ear'); if (ear) ear.onclick = () => say(last);
  }
  function steps() { return task ? '<div class="dots">' + task.steps.map((s) => '<i class="' + (state.done[s.id] ? 'd' : '') + '"></i>').join('') + '</div>' : ''; }
  // A place can hold several tasks (the kitchen: wash your hands, where food comes from). Everything any of them has
  // already done is put back first (never worse); then the chosen task, or the first one not yet finished, begins.
  function startTask(place, tid) {
    clearGlow(); lifted = null; card.classList.remove('done');
    if (place.hub) { task = null; walk = null;
      const back = lastDoor && place.doors[lastDoor]; if (back && things.walker) { const th = things.walker, s = onWalk(back); th.group.position.set(s[0], 1, s[1]); th.goal.copy(th.group.position); }
      if (place.town && things.walker) { const p = things.walker.group.position; center.set(p.x, 1, p.z); centerGoal.copy(center); } // start the view on you
      const hello = VT.STREET_LINES[0];
      show(hello); say(hello); return; }
    const ids = place.tasks || (place.task ? [place.task] : []);
    if (!ids.length) { task = null; show(''); return; }
    const pick = tid || ids.find((id) => !VT.isDone(VT.TASKS[id], VT.restore(VT.TASKS[id], load()[id] || null))) || ids[0], chosen = VT.TASKS[pick];
    // A steps-in-order task not yet begun starts clean: the things it uses are left as they were drawn, whatever other tasks here did with them.
    const mine = new Set(); if (chosen.kind === 'order' && !chosen.steps.some((s) => VT.restore(chosen, load()[pick] || null).done[s.id])) for (const s of chosen.steps) for (const x of [s.tap, s.item, s.home, ...(s.show || []), ...(s.hide || [])]) if (x) mine.add(x);
    const keep = (l) => (l || []).filter((x) => !mine.has(x));
    for (const id of ids) { const t = VT.TASKS[id], stt = VT.restore(t, load()[id] || null), st = VT.fresh();
      for (const s of t.steps) if (stt.done[s.id]) {
        if (t.kind === 'order') effects(keep(s.show), keep(s.hide));
        else { if (s.kind === 'move' && !mine.has(s.item)) { const to = VT.landing(t, st, s), th = things[s.item]; th.goal.set(to[0], to[1], to[2]); th.group.position.copy(th.goal); } else if (!mine.has(s.item)) swap(s.item); effects(keep(s.show), keep(s.hide)); }
        st.done[s.id] = true;
      } }
    task = VT.TASKS[pick]; state = VT.restore(task, load()[task.id] || null);
    if (task.focus) { center.set(task.focus[0], task.focus[1], task.focus[2]); centerGoal.copy(center); Object.assign(cam.goal, task.view || {}); zoomBase = cam.goal.dist; } // some tasks look closer at where they happen
    if (task.setup) effects(task.setup.show, task.setup.hide); // what this task needs to see (rain at the window)
    if (VT.isDone(task, state)) { finished(true); return; }
    follow();
    const nxt = task.kind === 'order' && task.steps.find((s) => !state.done[s.id]), line = nxt && task.steps.some((s) => state.done[s.id]) ? nxt.ask : task.start; // picking up where you left off
    show(line, steps()); say(line);
  }
  // Hands-on tasks (task.close, in blocks) look up close: the camera glides to whatever the next step asks you to tap
  // (a step's look: a thing or [x, y, z]; with task.work, halfway to the spot the tools work on), and steps back to the whole task when it is finished.
  function follow() {
    if (!task || !task.close) return;
    const nxt = task.kind === 'order' && task.steps.find((s) => !state.done[s.id]);
    if (!nxt) { if (task.focus) centerGoal.set(task.focus[0], task.focus[1], task.focus[2]); Object.assign(cam.goal, task.view || {}); zoomBase = cam.goal.dist; return; }
    const pt = (w) => { if (Array.isArray(w)) return new THREE.Vector3(w[0], w[1], w[2]); const th = things[w]; if (!th) return null; const was = th.group.visible; th.group.visible = true; const c = new THREE.Box3().setFromObject(th.group).getCenter(new THREE.Vector3()); th.group.visible = was; return c; };
    let c = pt(nxt.look || nxt.tap); if (!c) return;
    const work = !nxt.look && task.work && pt(task.work); if (work) c.lerp(work, 0.5); // the tool and the spot it works on, both in view
    centerGoal.copy(c); cam.goal.dist = zoomBase = nxt.close || task.close; if (task.closeTilt) cam.goal.tilt = task.closeTilt; wake();
  }
  function effects(show, hide) { for (const id of show || []) if (things[id]) things[id].group.visible = true; for (const id of hide || []) if (things[id]) things[id].group.visible = false; }
  function swap(id) { const th = things[id]; if (th && th.def.made) { th.model = th.def.made; drawThingNow(th); } }
  function drawThingNow(th) { window.vvDrawThing(th); }
  let walk = null, lastDoor = null;
  const onWalk = (door) => VT.onWalk(current.town, door); // the town's walking rules live in tasks.js (tested there)
  function hubTap(id) {
    const door = current.doors && current.doors[id]; if (!door || walk) return;
    const p = things.walker.group.position, q = VT.townRoute(current.town, [p.x, p.z], door);
    const line = 'Off to ' + door.name + '!'; show(line); say(line);
    walk = { queue: q, then: () => { lastDoor = id; go(Object.keys(PLACES).find((k) => PLACES[k] === PLACES[door.place]) || door.place); } };
    wake();
  }
  function tapThing(id) {
    if (current && current.hub) return hubTap(id);
    if (!task) return;
    const r = VT.tap(task, state, id); state = r.state; clearGlow();
    if (lifted && lifted !== r.lift && things[lifted] && !(r.move && r.move.item === lifted)) things[lifted].goal.y -= 0.3;
    if (r.lift && things[r.lift] && lifted !== r.lift) things[r.lift].goal.y += 0.3;
    lifted = r.lift || (r.move ? null : lifted);
    if (r.move) { things[r.move.item].goal.set(r.move.to[0], r.move.to[1], r.move.to[2]); lifted = null; }
    if (r.swap) swap(r.swap);
    effects(r.show, r.hide);
    if (r.glow) glow(r.glow);
    const d = load(); d[task.id] = { done: state.done }; save(d);
    follow();
    if (r.finished) { say([r.say, task.real]); finished(false, r.say); } else if (r.say) { show(r.say, steps()); say(r.say); }
    wake();
  }
  function glow(id) { // a calm, steady light around the place a thing belongs (it never blinks)
    const th = things[id]; if (!th) return;
    const bb = new THREE.Box3().setFromObject(th.group), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    glowBox = new THREE.Mesh(new THREE.BoxGeometry(sz.x + 0.2, sz.y + 0.2, sz.z + 0.2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.32, depthWrite: false }));
    glowBox.position.copy(c); group.add(glowBox);
  }
  function clearGlow() { if (glowBox) { group.remove(glowBox); glowBox.geometry.dispose(); glowBox = null; } }
  function finished(already, said) {
    const others = (current.tasks || []).filter((id) => id !== task.id);
    show((said || task.finish) + ' ' + task.real, '<div class="acts"><button class="again">' + (task.again || 'Do it again') + '</button>' + others.map((id) => '<button class="again" data-t="' + id + '">Next: ' + VT.TASKS[id].title + '</button>').join('') + '</div>');
    card.classList.add('done');
    card.querySelectorAll('.again').forEach((b) => b.onclick = () => {
      if (b.dataset.t) { const t = b.dataset.t, d = load(); if (VT.isDone(VT.TASKS[t], VT.restore(VT.TASKS[t], d[t] || null))) { delete d[t]; save(d); } build(current, t); return; }
      const d = load(); delete d[task.id]; save(d); build(current, task.id);
    });
  }

  // place buttons
  let current = null;
  const bar = document.getElementById('vv-places');
  bar.innerHTML = Object.entries(PLACES).map(([id, p]) => '<button data-p="' + id + '">' + p.name + '</button>').join('');
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p); });
  function go(id, tid) {
    if (window.vvHush) vvHush();
    if (PLACES[id].machine) { // the machine has its own board, tray and test button
      current = PLACES[id]; bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === id));
      canvas.style.display = 'none'; card.hidden = true; document.querySelector('#vv .hint').style.display = 'none';
      MACHINE.show({ say, load, save }); return;
    }
    MACHINE.hide(); canvas.style.display = ''; const hint = document.querySelector('#vv .hint'); hint.style.display = '';
    hint.textContent = PLACES[id].town ? 'Slide to look around. Pinch or scroll to look closer.' : 'Drag to turn. Pinch or scroll to look closer.';
    current = PLACES[id]; bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === id)); const on = bar.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' }); build(current, tid); }

  window.addEventListener('resize', resize);
  // The task card beside or under the village changes the village's size when it shows or hides.
  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
  // A link can open one place: /village/#clinic (Brave steps sends a child to practise a first step here).
  const firstPlace = location.hash.slice(1).split(/[&,]/).find((p) => Object.prototype.hasOwnProperty.call(PLACES, p)) || Object.keys(PLACES)[0];
  resize(); go(firstPlace);
  window.vvLook = (x, z, d) => { centerGoal.set(x, 1, z); if (d) cam.goal.dist = d; wake(); }; window.vvGo = go; window.vvTap = (id) => tapThing(id); window.vvFrame = () => { raf = 0; frame(); }; window.vvCam = () => ({ angle: cam.angle, tilt: cam.tilt, dist: cam.dist, goal: cam.goal, center: center.toArray() });
  // How big each thing the task asks for looks on screen, in CSS pixels (for checks: kids must be able to see what they are looking for).
  window.vvSizes = (ids) => { const out = {}, b = new THREE.Box3(), r = renderer.domElement.getBoundingClientRect(); for (const id of ids || wanted()) { const th = things[id]; if (!th || !th.group.visible) continue; b.setFromObject(th.group); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) { const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera); const sx = (p.x + 1) / 2 * r.width, sy = (1 - p.y) / 2 * r.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    out[id] = Math.round(Math.max(x1 - x0, y1 - y0)); } return out; }; // for checks in the browser (vvFrame steps one frame when the page is hidden)
})();
