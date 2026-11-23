// Void University scenes, the objects (22 Nov 2026; Bryan picked "A, objects with tags"). A scene piece with
// "prop": "<name>" is drawn as a real object on the lit table instead of a card; its words go on a paper tag tied to it
// with a string (scene.js), and the tag turns over to the idea's name. Every object here is modelled in code: turned on
// a lathe, packed with dimples, cut from shapes. Nothing is downloaded or generated.
//
// Each object: build(actor, ctx) -> { group, top, anchor(name), update(A, B, e) }
//   group   the object, its foot at (0, 0, 0), centred on the piece's place on the table
//   top     how high its top is, in metres, so another piece can rest "on" it
//   anchor  where a string ties on, in the object's own space: 'tie' (its own tag) or a named part ('chip')
//   update  its own states between two steps: A and B are the piece before and after, e is 0..1 through the step
// ctx: { S (metres per scene unit), env (an environment for metal and gloss) }
import * as THREE from './three.module.min.js';

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lerp = (a, b, t) => a + (b - a) * t;
const flag = (v, k) => (v && v[k] ? 1 : 0);
const cache = {};

function noise(g, w, h, base, amt) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
// Light birch for a tee: pale wood with long fibres.
function birch() {
  if (cache.birch) return cache.birch;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  noise(g, 512, 512, '#e6c99b', 14);
  for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,80,40,' + (0.05 + rnd() * 0.12) + ')'; g.lineWidth = 1 + rnd() * 2; const x = rnd() * 512; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 8, 170, x - 8, 340, x + 4, 512); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (cache.birch = t);
}
// A golf ball's dimples as a bump map, rows packed by latitude so they keep their size toward the poles.
function dimples() {
  if (cache.dimples) return cache.dimples;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 2048, 1024);
  const rows = 22;
  for (let i = 0; i < rows; i++) {
    const lat = -Math.PI / 2 + (i + 0.5) * Math.PI / rows, y = (i + 0.5) * 1024 / rows;
    const n = Math.max(3, Math.round(2 * rows * Math.cos(lat))), sx = 2048 / n, sy = 1024 / rows;
    for (let k = 0; k < n; k++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.8, '#d4d4d4'); gr.addColorStop(1, '#fff');
      g.save(); g.translate((k + (i % 2) * 0.5) * sx, y); g.scale(sx * 0.42, sy * 0.42); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    }
  }
  return (cache.dimples = new THREE.CanvasTexture(c));
}
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
const num = (v, k) => (v && typeof v[k] === 'number' ? v[k] : v && v[k] ? 1 : 0);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Planks for a gate, a post and a bench: grey-brown wood weathered outdoors, grain running along the board.
function weathered(tone) {
  const key = 'wood' + tone;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d');
  noise(g, 256, 1024, tone, 18);
  for (let i = 0; i < 70; i++) { g.strokeStyle = 'rgba(40,30,20,' + (0.06 + rnd() * 0.16) + ')'; g.lineWidth = 0.6 + rnd() * 1.8; const x = rnd() * 256; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, 340, x - 6, 680, x + 3, 1024); g.stroke(); }
  for (let i = 0; i < 5; i++) { const x = rnd() * 256, y = rnd() * 1024; g.fillStyle = 'rgba(50,35,22,0.35)'; g.beginPath(); g.ellipse(x, y, 4 + rnd() * 5, 10 + rnd() * 12, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (cache[key] = t);
}
// a board: a box with the grain running along its longest side
function board(w, h, d, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (w > h && w > d) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); }
  return shadowed(new THREE.Mesh(geo, mat));
}
const iron = (env) => new THREE.MeshStandardMaterial({ color: 0x2b2b2e, metalness: 0.8, roughness: 0.45, envMap: env, envMapIntensity: 0.6 });

// A patch of turf: a backing mat and thousands of blades.
function turf(w, d) {
  const group = new THREE.Group();
  const mat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), new THREE.MeshStandardMaterial({ color: 0x1d3a1a, roughness: 1 })));
  mat.position.y = 0.015; group.add(mat);
  const n = Math.round(w * d * 2400), blade = new THREE.ConeGeometry(0.012, 1, 3); blade.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.3, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
    m4.compose(new THREE.Vector3((rnd() - 0.5) * w * 0.98, 0.03, (rnd() - 0.5) * d * 0.98), q, new THREE.Vector3(1, 0.07 + rnd() * 0.06, 1));
    inst.setMatrixAt(i, m4); col.setHSL(0.27 + rnd() * 0.05, 0.55, 0.18 + rnd() * 0.14); inst.setColorAt(i, col);
  }
  group.add(shadowed(inst));
  return group;
}

export const PROPS = {
  // A golf ball. Its size is the piece's width.
  'golf-ball': {
    build(a, ctx) {
      const r = (a.w || 60) * ctx.S / 2;
      const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshPhysicalMaterial({ color: 0xf4f3ee, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, bumpMap: dimples(), bumpScale: -2.2, envMap: ctx.env, envMapIntensity: 0.5 })));
      const spin = new THREE.Group(); spin.position.y = r; spin.add(m);
      const group = new THREE.Group(); group.add(spin);
      return { group, spin, top: 2 * r, radius: r, anchor: () => new THREE.Vector3(0, r * 0.4, r * 0.9), update() {} };
    },
  },
  // A wooden tee pushed into a square of turf. The turf is the piece's width and height; "chipped": true breaks a piece
  // off the rim, and it lands on the turf (its anchor is 'chip', so the rim can wear its own tag).
  tee: {
    build(a, ctx) {
      const w = (a.w || 200) * ctx.S, d = (a.h || 150) * ctx.S, s = Math.min(w, d) * 0.62;
      const group = new THREE.Group(); group.add(turf(w, d));
      const mat = new THREE.MeshStandardMaterial({ map: birch(), roughness: 0.7, envMap: ctx.env, envMapIntensity: 0.25 });
      const tee = new THREE.Group(); tee.position.y = 0.03 - 0.45 * s; group.add(tee);
      const body = [[0, 0], [0.012, 0.05], [0.05, 0.25], [0.075, 0.9], [0.09, 1.0], [0.16, 1.08], [0.24, 1.12]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
      tee.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(body, 48), mat)));
      const rim = [[0.24, 1.12], [0.29, 1.15], [0.3, 1.19], [0.27, 1.2], [0.2, 1.16], [0, 1.14]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
      const gap = 1.1, start = -0.55; // the piece that breaks, on the side toward the camera
      const whole = shadowed(new THREE.Mesh(new THREE.LatheGeometry(rim, 64), mat));
      const broken = shadowed(new THREE.Mesh(new THREE.LatheGeometry(rim, 64, start + gap, Math.PI * 2 - gap), mat));
      const raw = new THREE.MeshStandardMaterial({ color: 0xe9d3ac, roughness: 0.95 });
      [start, start + gap].forEach((ang) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.09 * s, 0.07 * s), raw); f.position.set(Math.sin(ang) * 0.255 * s, 1.165 * s, Math.cos(ang) * 0.255 * s); f.rotation.y = ang + Math.PI / 2; broken.add(f); });
      tee.add(whole, broken);
      // the piece that breaks off, centred on itself so it tumbles about its own middle
      const chipGeo = new THREE.LatheGeometry(rim.slice(0, 5), 16, start, gap); chipGeo.translate(0, -1.16 * s, -0.26 * s);
      const chip = new THREE.Group(); chip.add(shadowed(new THREE.Mesh(chipGeo, mat))); tee.add(chip);
      const home = new THREE.Vector3(0, 1.16 * s, 0.26 * s);
      // where it lands: on the turf, in front and to the left
      const rest = new THREE.Vector3(-0.3 * w, 0.06 - tee.position.y, 0.24 * d);
      const top = 0.03 - 0.45 * s + 1.14 * s;
      return {
        group, top, cup: 0.26 * s,
        anchor(name) {
          if (name === 'chip') return chip.position.clone().add(tee.position);
          return new THREE.Vector3(0.06 * s, tee.position.y + 0.75 * s, 0.05 * s);
        },
        update(A, B, e) {
          const c = lerp(flag(A, 'chipped'), flag(B, 'chipped'), e);
          whole.visible = c < 0.02; broken.visible = !whole.visible;
          chip.position.copy(home).lerp(rest, c); chip.position.y += Math.sin(Math.PI * c) * 0.35 * s;
          chip.rotation.set(c * 1.4, c * 0.9, 0);
        },
      };
    },
  },
  // A brass shell-game cup, mouth down. "lifted": true raises and tips it to show what is (or is not) under it.
  cup: {
    build(a, ctx) {
      const r = Math.min(a.w || 140, a.h || 140) * ctx.S * 0.32, h = r * 1.8;
      const pts = [[0, h], [r * 0.62, h], [r * 0.7, h * 0.96], [r * 0.82, h * 0.5], [r * 0.95, h * 0.08], [r, 0.02], [r * 0.97, 0], [r * 0.9, 0.02], [r * 0.78, h * 0.5], [r * 0.6, h * 0.94], [0, h * 0.94]].map(([x, y]) => new THREE.Vector2(x, y));
      const cup = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshPhysicalMaterial({ color: 0xb98a46, metalness: 1, roughness: 0.32, clearcoat: 0.4, side: THREE.DoubleSide, envMap: ctx.env, envMapIntensity: 1.2 })));
      const group = new THREE.Group(); group.add(cup);
      return {
        group, top: h, mats: [cup.material],
        anchor: () => new THREE.Vector3(cup.position.x, cup.position.y + h * 0.1, cup.position.z + r * 0.95),
        update(A, B, e) {
          const l = lerp(flag(A, 'lifted'), flag(B, 'lifted'), e);
          cup.position.set(0.1 * r * l, 0.85 * h * l, 0.45 * r * l); cup.rotation.set(-0.45 * l, 0, 0.25 * l);
        },
      };
    },
  },

  // A brass garden tap on a standpipe: the pipe rises from a flange, bends, and the spout points along +x.
  tap: {
    build(a, ctx) {
      const s = Math.min(a.w || 110, a.h || 110) * ctx.S, H = 0.85 * s / 1.1 + 0.2;
      const brass = new THREE.MeshPhysicalMaterial({ color: 0xc49a4a, metalness: 1, roughness: 0.28, clearcoat: 0.3, envMap: ctx.env, envMapIntensity: 1.2 });
      const group = new THREE.Group();
      const flange = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 0.05, 32), brass)); flange.position.y = 0.025; group.add(flange);
      const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, H, 24), brass)); pipe.position.y = H / 2; group.add(pipe);
      const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 24, 16), brass)); body.position.y = H; group.add(body);
      const spout = new THREE.CurvePath(); spout.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, H, 0), new THREE.Vector3(0.32 * s, H, 0), new THREE.Vector3(0.34 * s, H - 0.14 * s, 0)));
      group.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(spout, 24, 0.05 * s, 16), brass)));
      const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.16 * s, 12), brass)); stem.position.y = H + 0.16 * s; group.add(stem);
      const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.11 * s, 0.022 * s, 10, 32), new THREE.MeshStandardMaterial({ color: 0x8c1f1a, roughness: 0.5 }))); wheel.rotation.x = Math.PI / 2; wheel.position.y = H + 0.24 * s; group.add(wheel);
      [0, Math.PI / 2].forEach((r) => { const spoke = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.02 * s, 0.02 * s), wheel.material)); spoke.rotation.y = r; spoke.position.y = H + 0.24 * s; group.add(spoke); });
      return { group, top: H + 0.3 * s, spout: new THREE.Vector3(0.34 * s, H - 0.16 * s, 0), anchor: () => new THREE.Vector3(0, H * 0.45, 0.06 * s), update() {} };
    },
  },
  // A green garden hose lying along the table between its two raised ends ("ends": [left, right] heights in scene units).
  // "pinched": true flattens it in the middle, where something heavy stands on it.
  hose: {
    build(a, ctx) {
      const L = (a.w || 400) * ctx.S, ends = a.ends || [80, 60], e0 = ends[0] * ctx.S, e1 = ends[1] * ctx.S, r = 0.04;
      const pts = [[-L / 2, e0, 0], [-L / 2 + 0.08, e0 * 0.55, 0.04], [-L / 2 + 0.3, r, 0.16], [-L * 0.18, r, 0.24], [0, r, 0.14], [L * 0.2, r, -0.04], [L / 2 - 0.32, r, 0.06], [L / 2 - 0.08, e1 * 0.6, 0.03], [L / 2, e1, 0]].map((q) => new THREE.Vector3(q[0], q[1], q[2]));
      const curve = new THREE.CatmullRomCurve3(pts), T = 240, R = 12;
      const geo = new THREE.TubeGeometry(curve, T, r, R);
      const pos = geo.attributes.position, base = pos.array.slice(), centres = [];
      for (let j = 0; j <= T; j++) centres.push(curve.getPointAt(j / T));
      const m = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2e7a3a, roughness: 0.5, envMap: ctx.env, envMapIntensity: 0.4 })));
      const group = new THREE.Group(); group.add(m);
      let was = -1;
      return {
        group, top: 0.1, anchor: () => new THREE.Vector3(L * 0.08, r, 0.2),
        update(A, B, e) {
          const p = lerp(flag(A, 'pinched'), flag(B, 'pinched'), e);
          if (Math.abs(p - was) < 1e-3) return; was = p;
          for (let i = 0; i < pos.count; i++) {
            const c = centres[Math.floor(i / (R + 1))], t = smooth(1 - Math.abs(c.x) / 0.45) * (c.y < r * 1.5 ? 1 : 0);
            const k = p * t;
            pos.setXYZ(i, base[i * 3], c.y + (base[i * 3 + 1] - c.y) * (1 - 0.78 * k) - 0.025 * k, c.z + (base[i * 3 + 2] - c.z) * (1 + 0.5 * k));
          }
          pos.needsUpdate = true; geo.computeVertexNormals();
        },
      };
    },
  },
  // A terracotta pot with a leafy plant. "wilted": true droops the leaves and turns them brown.
  plant: {
    build(a, ctx) {
      const s = Math.min(a.w || 130, a.h || 130) * ctx.S;
      const group = new THREE.Group();
      const pot = [[0, 0], [0.3, 0], [0.32, 0.02], [0.42, 0.5], [0.47, 0.52], [0.47, 0.6], [0.43, 0.6], [0.4, 0.54], [0, 0.54]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
      group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(pot, 48), new THREE.MeshStandardMaterial({ color: 0xb5603a, roughness: 0.85 }))));
      const soil = new THREE.Mesh(new THREE.CircleGeometry(0.41 * s, 32), new THREE.MeshStandardMaterial({ color: 0x2e2117, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.55 * s; soil.receiveShadow = true; group.add(soil);
      const green = new THREE.Color(0x3f8f3a), dry = new THREE.Color(0x8a7434);
      const leafMat = new THREE.MeshStandardMaterial({ color: green.clone(), roughness: 0.6, side: THREE.DoubleSide });
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x3c6b2c, roughness: 0.7 });
      const leaves = [];
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + rnd() * 0.3, len = (0.38 + rnd() * 0.18) * s, rise = 0.35 + rnd() * 0.3;
        const arm = new THREE.Group(); arm.position.y = 0.55 * s; arm.rotation.y = ang; group.add(arm);
        const stalk = new THREE.Group(); arm.add(stalk);
        const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.016 * s, len, 6), stemMat)); stem.position.y = len / 2; stalk.add(stem);
        const leaf = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), leafMat)); leaf.scale.set(0.1 * s, 0.012 * s, 0.2 * s); leaf.position.set(0, len, 0.12 * s); leaf.rotation.x = -0.4; stalk.add(leaf);
        stalk.rotation.x = rise; leaves.push({ stalk, rise });
      }
      return {
        group, top: 1.1 * s, anchor: () => new THREE.Vector3(-0.3 * s, 0.35 * s, 0.32 * s),
        update(A, B, e) {
          const w = lerp(flag(A, 'wilted'), flag(B, 'wilted'), e);
          leaves.forEach((l) => { l.stalk.rotation.x = lerp(l.rise, 1.25, w); l.stalk.scale.setScalar(1 - 0.18 * w); });
          leafMat.color.copy(green).lerp(dry, w);
        },
      };
    },
  },
  // A car tyre standing on its tread, a steel wheel in it, facing you. It rolls in from the side (no drop from above).
  tyre: {
    build(a, ctx) {
      const s = Math.min(a.w || 130, a.h || 130) * ctx.S, R = 0.42 * s, tube = 0.17 * s, out = R + tube;
      const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#444';
      for (let i = 0; i < 64; i++) { const x = i * 8; g.fillRect(x, 0, 3, 64); }
      const bump = new THREE.CanvasTexture(c); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(6, 1);
      const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.85, bumpMap: bump, bumpScale: 3 });
      const spin = new THREE.Group(); spin.position.y = out;
      const t = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, tube, 24, 72), rubber)); spin.add(t);
      const steel = new THREE.MeshStandardMaterial({ color: 0x8d9096, metalness: 0.9, roughness: 0.35, envMap: ctx.env, envMapIntensity: 0.8 });
      const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.92, R * 0.92, tube * 1.1, 40), steel)); disc.rotation.x = Math.PI / 2; spin.add(disc);
      for (let i = 0; i < 5; i++) { const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, tube * 1.3, 10), steel)); const ang = (i / 5) * Math.PI * 2; b.rotation.x = Math.PI / 2; b.position.set(Math.cos(ang) * R * 0.35, Math.sin(ang) * R * 0.35, 0); spin.add(b); }
      const group = new THREE.Group(); group.add(spin);
      return { group, spin, radius: out, rollsIn: true, top: 2 * out, anchor: () => new THREE.Vector3(tube, out, 0), update() {} };
    },
  },
  // A wooden picket gate hung on its own hinge post at its left end; the leaf swings about the hinge. "open": a number,
  // 1 swings it away, -1 toward you. Its iron latch reaches past the right end into the gatepost's catch; "snapped":
  // true breaks it, and the outer half falls. Anchors: 'latch', and 'tie' for the gate itself.
  gate: {
    build(a, ctx) {
      const W = (a.w || 240) * ctx.S, H = Math.min(1.25, W * 0.5), wood = new THREE.MeshStandardMaterial({ map: weathered('#8b7a64'), roughness: 0.85 });
      const group = new THREE.Group();
      const hinge = board(0.16, H + 0.3, 0.16, wood); hinge.position.set(-W / 2, (H + 0.3) / 2, 0); group.add(hinge);
      const leaf = new THREE.Group(); leaf.position.set(-W / 2 + 0.1, 0.12, 0); group.add(leaf);
      const lw = W - 0.16;
      [0.08, lw - 0.06].forEach((x) => { const st = board(0.1, H, 0.07, wood); st.position.set(x, H / 2, 0); leaf.add(st); });
      [0.18, H - 0.15].forEach((y) => { const rl = board(lw, 0.1, 0.06, wood); rl.position.set(lw / 2, y, -0.045); leaf.add(rl); });
      const brace = board(Math.hypot(lw - 0.2, H - 0.4), 0.08, 0.05, wood); brace.position.set(lw / 2, H / 2, -0.045); brace.rotation.z = Math.atan2(H - 0.4, lw - 0.2); leaf.add(brace);
      const n = Math.max(5, Math.round(lw / 0.17));
      for (let i = 0; i < n; i++) { const x = 0.16 + (i + 0.5) * (lw - 0.26) / n; const pk = board(0.11, H + 0.1, 0.03, wood); pk.position.set(x, (H + 0.1) / 2 - 0.02, 0.05); leaf.add(pk); }
      // the hinges: two black straps
      [0.25, H - 0.22].forEach((y) => { const hs = board(0.36, 0.05, 0.015, iron(ctx.env)); hs.position.set(0.12, y, 0.07); leaf.add(hs); });
      // the latch: an iron bar on the far end, out past the leaf
      const ly = H * 0.62, inner = board(0.22, 0.045, 0.03, iron(ctx.env)); inner.position.set(lw - 0.08, ly, 0.075); leaf.add(inner);
      const outer = board(0.16, 0.045, 0.03, iron(ctx.env)); leaf.add(outer);
      const home = new THREE.Vector3(lw + 0.1, ly, 0.075), fallen = new THREE.Vector3(lw + 0.18, -0.1, 0.35);
      return {
        group, top: H + 0.3, leaf,
        anchor(name) {
          leaf.updateMatrix(); outer.updateMatrix();
          if (name === 'latch') return outer.position.clone().applyMatrix4(leaf.matrix);
          return new THREE.Vector3(lw * 0.55, 0.4, 0.06).applyMatrix4(leaf.matrix);
        },
        update(A, B, e) {
          leaf.rotation.y = lerp(num(A, 'open'), num(B, 'open'), e) * 1.15;
          const k = lerp(flag(A, 'snapped'), flag(B, 'snapped'), e);
          // the broken half drops to the table in front of the gate, wherever the leaf has swung
          outer.position.copy(home).lerp(fallen, k); outer.position.y += Math.sin(Math.PI * k) * 0.25;
          outer.rotation.set(k * 1.2, k * 0.6, k * 1.4);
          outer.visible = true;
        },
      };
    },
  },
  // A square gatepost with a capped top and an iron catch on its left face.
  gatepost: {
    build(a, ctx) {
      const H = 1.65, wood = new THREE.MeshStandardMaterial({ map: weathered('#7d6c58'), roughness: 0.85 });
      const group = new THREE.Group();
      const post = board(0.2, H, 0.2, wood); post.position.y = H / 2; group.add(post);
      const cap = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 4), wood)); cap.rotation.y = Math.PI / 4; cap.position.y = H + 0.06; group.add(cap);
      const catchMat = iron(ctx.env);
      [[-0.11, 0.84, 0.04], [-0.11, 0.7, 0.04]].forEach(([x, y]) => { const b = board(0.05, 0.03, 0.06, catchMat); b.position.set(x, y, 0.07); group.add(b); });
      const back = board(0.03, 0.17, 0.06, catchMat); back.position.set(-0.125, 0.77, 0.07); group.add(back);
      return { group, top: H + 0.12, anchor: () => new THREE.Vector3(0, 0.45, 0.1), update() {} };
    },
  },
  // A small wooden bench without a back.
  bench: {
    build(a, ctx) {
      const L = (a.w || 320) * ctx.S, D = Math.min(0.75, (a.h || 90) * ctx.S), Hs = 0.6, wood = new THREE.MeshStandardMaterial({ map: weathered('#7a5a3c'), roughness: 0.75 });
      const group = new THREE.Group();
      for (let i = 0; i < 3; i++) { const sl = board(L, 0.06, D / 3 - 0.03, wood); sl.position.set(0, Hs - 0.03, -D / 2 + (i + 0.5) * D / 3); group.add(sl); }
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => { const lg = board(0.09, Hs - 0.06, 0.09, wood); lg.position.set(sx * (L / 2 - 0.15), (Hs - 0.06) / 2, sz * (D / 2 - 0.1)); group.add(lg); }));
      [-1, 1].forEach((sx) => { const rl = board(0.07, 0.08, D - 0.15, wood); rl.position.set(sx * (L / 2 - 0.15), 0.18, 0); group.add(rl); });
      return { group, top: Hs, anchor: () => new THREE.Vector3(-L / 2 + 0.2, Hs * 0.6, D / 2), update() {} };
    },
  },
  // A leather holdall. "swell": true grows it along its length and a little in girth.
  bag: {
    build(a, ctx) {
      const L = (a.w || 110) * ctx.S, r = Math.min(0.32, (a.h || 50) * ctx.S * 0.6);
      const leather = new THREE.MeshPhysicalMaterial({ color: 0x6b3f22, roughness: 0.55, clearcoat: 0.25, envMap: ctx.env, envMapIntensity: 0.4 });
      const body = new THREE.Group();
      const m = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, L - 2 * r), 12, 32), leather)); m.rotation.z = Math.PI / 2; m.scale.set(0.8, 1, 0.9); body.add(m);
      const strap = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7 });
      [-0.22, 0.22].forEach((z) => { const h = shadowed(new THREE.Mesh(new THREE.TorusGeometry(L * 0.16, 0.028, 8, 24, Math.PI), strap)); h.position.set(0, r * 0.68, z * r); body.add(h); });
      [-1, 1].forEach((sd) => { const end = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.03, 8, 32), strap)); end.rotation.y = Math.PI / 2; end.scale.set(1, 0.8, 0.9); end.position.x = sd * (L / 2 - r * 0.55); body.add(end); });
      const zip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L * 0.7, 0.02, 0.03), new THREE.MeshStandardMaterial({ color: 0x9a8a60, metalness: 0.8, roughness: 0.4 }))); zip.position.y = r * 0.8; body.add(zip);
      body.position.y = r * 0.8;
      const group = new THREE.Group(); group.add(body);
      return {
        group, top: 2 * r, anchor: () => new THREE.Vector3(-L * 0.3, r * 0.6, r * 0.75),
        update(A, B, e) { const k = lerp(flag(A, 'swell'), flag(B, 'swell'), e); body.scale.set(1 + 0.7 * k, 1 + 0.3 * k, 1 + 0.3 * k); body.position.y = r * 0.8 * (1 + 0.3 * k); },
      };
    },
  },
  // A jointed wooden figure of the kind artists keep on a desk, sitting, facing you. "squeezed": true leans it away
  // from whatever presses on its left.
  figure: {
    build(a, ctx) {
      const s = (a.h || 100) * ctx.S, wood = new THREE.MeshStandardMaterial({ map: birch(), roughness: 0.55, envMap: ctx.env, envMapIntensity: 0.3 });
      const part = (geo, x, y, z, rx = 0, rz = 0, parent) => { const m = shadowed(new THREE.Mesh(geo, wood)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); (parent || body).add(m); return m; };
      const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 16), ball = (r) => new THREE.SphereGeometry(r, 16, 12);
      const body = new THREE.Group();
      // pelvis on the seat, thighs forward, shins down to the floor in front of the seat
      part(cap(0.12 * s, 0.14 * s), 0, 0.1 * s, 0, 0, Math.PI / 2);
      [-1, 1].forEach((sd) => {
        part(cap(0.075 * s, 0.32 * s), sd * 0.1 * s, 0.08 * s, 0.24 * s, Math.PI / 2);
        part(ball(0.07 * s), sd * 0.1 * s, 0.08 * s, 0.47 * s);
        part(cap(0.06 * s, 0.34 * s), sd * 0.1 * s, -0.17 * s, 0.5 * s);
        part(new THREE.BoxGeometry(0.09 * s, 0.05 * s, 0.17 * s), sd * 0.1 * s, -0.4 * s, 0.56 * s);
      });
      part(ball(0.07 * s), 0, 0.26 * s, 0);
      part(cap(0.14 * s, 0.2 * s), 0, 0.46 * s, 0);
      part(cap(0.045 * s, 0.06 * s), 0, 0.68 * s, 0);
      const head = part(ball(0.1 * s), 0, 0.84 * s, 0.02 * s); head.scale.set(0.85, 1.15, 0.95);
      [-1, 1].forEach((sd) => {
        part(ball(0.055 * s), sd * 0.19 * s, 0.58 * s, 0);
        part(cap(0.045 * s, 0.22 * s), sd * 0.21 * s, 0.43 * s, 0.03 * s, 0.15, sd * -0.12);
        part(cap(0.04 * s, 0.2 * s), sd * 0.19 * s, 0.24 * s, 0.17 * s, 1.3, 0);
      });
      const seatDrop = 0.02 * s;
      body.position.y = seatDrop; // it sits on whatever it rests on; the feet reach down below the seat
      const group = new THREE.Group(); group.add(body);
      return {
        group, top: 1.05 * s, anchor: () => new THREE.Vector3(0.16 * s, seatDrop + 0.1 * s, 0.4 * s),
        update(A, B, e) { const k = lerp(flag(A, 'squeezed'), flag(B, 'squeezed'), e); body.rotation.z = -0.22 * k; body.position.x = 0.05 * s * k; },
      };
    },
  },
};
