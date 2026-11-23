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
      const s = (a.h || 100) * ctx.S, wood = new THREE.MeshStandardMaterial({ map: birch(), color: a.look === 'dark' ? 0x8a5a36 : 0xffffff, roughness: 0.55, envMap: ctx.env, envMapIntensity: 0.3 });
      const part = (geo, x, y, z, rx = 0, rz = 0, parent) => { const m = shadowed(new THREE.Mesh(geo, wood)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); (parent || body).add(m); return m; };
      const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 16), ball = (r) => new THREE.SphereGeometry(r, 16, 12);
      const body = new THREE.Group();
      // "pose": "stand": the figure stands on its own feet, arms down, turned "turn" radians (0 faces you)
      if (a.pose === 'stand') {
        [-1, 1].forEach((sd) => {
          part(new THREE.BoxGeometry(0.09 * s, 0.05 * s, 0.17 * s), sd * 0.07 * s, 0.025 * s, 0.03 * s);
          part(cap(0.055 * s, 0.17 * s), sd * 0.07 * s, 0.17 * s, 0);
          part(ball(0.06 * s), sd * 0.07 * s, 0.3 * s, 0);
          part(cap(0.07 * s, 0.16 * s), sd * 0.075 * s, 0.4 * s, 0);
          part(ball(0.045 * s), sd * 0.15 * s, 0.78 * s, 0);
          part(cap(0.038 * s, 0.14 * s), sd * 0.16 * s, 0.67 * s, 0, 0, sd * 0.08);
          part(ball(0.034 * s), sd * 0.17 * s, 0.57 * s, 0);
          part(cap(0.033 * s, 0.13 * s), sd * 0.175 * s, 0.47 * s, 0.01 * s, 0.08, 0);
          part(ball(0.036 * s), sd * 0.175 * s, 0.37 * s, 0.02 * s);
        });
        part(cap(0.1 * s, 0.1 * s), 0, 0.51 * s, 0, 0, Math.PI / 2);
        part(ball(0.065 * s), 0, 0.59 * s, 0);
        part(cap(0.11 * s, 0.08 * s), 0, 0.71 * s, 0);
        part(cap(0.035 * s, 0.04 * s), 0, 0.85 * s, 0);
        const hd = part(ball(0.08 * s), 0, 0.95 * s, 0.01 * s); hd.scale.set(0.85, 1.15, 0.95);
        body.rotation.y = a.turn || 0;
        const group = new THREE.Group(); group.add(body);
        return {
          group, top: 1.05 * s, anchor: () => new THREE.Vector3(0.1 * s, 0.5 * s, 0.08 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.turn || 0),
          update(A, B, e) { const ta = (A && A.turn != null ? A.turn : a.turn) || 0, tb = (B && B.turn != null ? B.turn : ta); body.rotation.y = lerp(ta, tb, e); },
        };
      }
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
  // A toy wooden house: painted walls, a pitched roof, a door and windows. "burnt": true chars it black and sags the
  // roof; "rebuilt": true stands it again in fresh pale wood.
  house: {
    build(a, ctx) {
      const shop = a.look === 'shop';
      const s = (a.w || 100) * ctx.S, W = 0.72 * s, H = (shop ? 0.56 : 0.5) * s, D = 0.55 * s;
      const tint = [0xc9b48f, 0xa8c0c8, 0xd2b0a2, 0xb9c6a0, 0xd8cfb8][(a.id || 'a').charCodeAt((a.id || 'a').length - 1) % 5];
      const paint = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.75 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.7 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6 });
      const group = new THREE.Group();
      const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), paint)); body.position.y = H / 2; group.add(body);
      const tri = new THREE.Shape(); tri.moveTo(-W / 2 - 0.05 * s, 0); tri.lineTo(W / 2 + 0.05 * s, 0); tri.lineTo(0, 0.36 * s); tri.closePath();
      const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: D + 0.08 * s, bevelEnabled: false }); roofGeo.translate(0, 0, -(D + 0.08 * s) / 2);
      const roof = shadowed(new THREE.Mesh(roofGeo, roofMat)); roof.position.y = H; group.add(roof);
      const dh = shop ? 0.36 : 0.26, lit = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffb866, emissiveIntensity: 0.55, roughness: 0.3 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, dh * s, 0.01), dark); door.position.set(0, (dh / 2) * s, D / 2 + 0.005); group.add(door);
      [-1, 1].forEach((sd) => { const w = new THREE.Mesh(new THREE.BoxGeometry(shop ? 0.16 * s : 0.12 * s, shop ? 0.17 * s : 0.11 * s, 0.01), shop ? lit : dark); w.position.set(sd * 0.22 * s, (shop ? 0.24 : 0.3) * s, D / 2 + 0.005); group.add(w); });
      // a shop: lit windows and a striped awning over the door ("awning": a colour)
      if (shop) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f3ede0' : (a.awning || '#a3281c'); g.fillRect(i * 32, 0, 32, 64); }
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
        const cloth = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8, side: THREE.DoubleSide });
        const aw = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, 0.2 * s), cloth)); aw.rotation.x = -0.55; aw.position.set(0, (dh + 0.1) * s, D / 2 + 0.085 * s); group.add(aw);
        const val = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, 0.045 * s), cloth)); val.position.set(0, (dh + 0.1) * s - 0.1 * s * Math.cos(0.55) - 0.02 * s, D / 2 + 0.085 * s + 0.1 * s * Math.sin(0.55)); group.add(val);
      }
      const base = new THREE.Color(tint), char = new THREE.Color(0x1b1816), fresh = new THREE.Color(0xe6d3ad), roofBase = new THREE.Color(0x7a3b2e);
      return {
        group, top: H + 0.36 * s, anchor: () => new THREE.Vector3(W * 0.3, 0.12 * s, D / 2),
        update(A, B, e) {
          const b = lerp(flag(A, 'burnt'), flag(B, 'burnt'), e), n = lerp(flag(A, 'rebuilt'), flag(B, 'rebuilt'), e);
          paint.color.copy(base).lerp(char, b * (1 - n)).lerp(fresh, n);
          roofMat.color.copy(roofBase).lerp(char, b * (1 - n)).lerp(fresh.clone().multiplyScalar(0.8), n);
          roof.rotation.z = 0.25 * b * (1 - n); roof.position.y = H - 0.12 * s * b * (1 - n);
        },
      };
    },
  },
  // A glass jar with a metal lid and coins in it. "coins": how many coins are in it (0 to about 40).
  jar: {
    build(a, ctx) {
      const s = Math.min(a.w || 120, a.h || 120) * ctx.S, R = 0.34 * s, H = 0.95 * s;
      const prof = [[0, 0], [R * 0.95, 0], [R, 0.04 * s], [R, H * 0.86], [R * 0.86, H * 0.93], [R * 0.86, H], [R * 0.82, H], [R * 0.82, H * 0.95], [R * 0.95, H * 0.86], [R * 0.95, 0.06 * s], [0, 0.05 * s]].map(([x, y]) => new THREE.Vector2(x, y));
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, envMap: ctx.env, envMapIntensity: 0.3, depthWrite: false });
      const group = new THREE.Group();
      const jar = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), glass); jar.renderOrder = 2; group.add(jar);
      const lid = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.08 * s, 40), new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 0.9, roughness: 0.3, envMap: ctx.env }))); lid.position.y = H + 0.04 * s; lid.castShadow = false; group.add(lid); // its shadow would fall through the glass as a dark disc
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a23c, metalness: 1, roughness: 0.3, envMap: ctx.env, envMapIntensity: 1.2 });
      const silver = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.3, envMap: ctx.env, envMapIntensity: 1.2 });
      const coinGeo = new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.025 * s, 24);
      const coins = [];
      for (let i = 0; i < 40; i++) {
        const c = shadowed(new THREE.Mesh(coinGeo, i % 3 ? gold : silver));
        const col = i % 4, row = Math.floor(i / 4);
        c.position.set((col % 2 ? 1 : -1) * 0.12 * s + (rnd() - 0.5) * 0.04 * s, 0.07 * s + row * 0.027 * s, (col > 1 ? 1 : -1) * 0.1 * s + (rnd() - 0.5) * 0.04 * s);
        c.rotation.set((rnd() - 0.5) * 0.25, rnd() * 6, (rnd() - 0.5) * 0.25); c.visible = false; group.add(c); coins.push(c);
      }
      return {
        group, top: H + 0.08 * s, anchor: () => new THREE.Vector3(R * 0.7, 0.3 * s, R * 0.75),
        update(A, B, e) { const n = Math.round(lerp(num(A, 'coins'), num(B, 'coins'), e)); coins.forEach((c, i) => { c.visible = i < n; }); },
      };
    },
  },
  // A wicker basket of groceries: a loaf, apples and a carton of milk.
  basket: {
    build(a, ctx) {
      const s = Math.min(a.w || 140, a.h || 140) * ctx.S, W = 0.9 * s, D = 0.6 * s, H = 0.38 * s;
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#9b7442'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 32) { g.fillStyle = (x / 32 + y / 16) % 2 ? '#7a5631' : '#b48a52'; g.fillRect(x + ((y / 16) % 2) * 16, y, 28, 13); }
      const weave = new THREE.CanvasTexture(c); weave.colorSpace = THREE.SRGBColorSpace; weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(3, 1.5);
      const wick = new THREE.MeshStandardMaterial({ map: weave, roughness: 0.9 });
      const group = new THREE.Group();
      const walls = [[0, H / 2, D / 2, W, H, 0.03], [0, H / 2, -D / 2, W, H, 0.03], [W / 2, H / 2, 0, 0.03, H, D], [-W / 2, H / 2, 0, 0.03, H, D], [0, 0.015, 0, W, 0.03, D]];
      walls.forEach(([x, y, z, w, h, d]) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wick)); m.position.set(x, y, z); group.add(m); });
      const handle = shadowed(new THREE.Mesh(new THREE.TorusGeometry(W * 0.42, 0.025 * s, 8, 32, Math.PI), wick)); handle.position.y = H; group.add(handle);
      const loaf = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * s, 0.32 * s, 8, 16), new THREE.MeshStandardMaterial({ color: 0xc58b4a, roughness: 0.8 }))); loaf.rotation.z = Math.PI / 2; loaf.rotation.y = 0.3; loaf.position.set(-0.15 * s, H * 0.9, -0.08 * s); group.add(loaf);
      const appleMat = new THREE.MeshStandardMaterial({ color: 0xb3262a, roughness: 0.4, envMap: ctx.env, envMapIntensity: 0.4 });
      [[0.18, 0.12], [0.3, -0.05], [0.08, -0.12]].forEach(([x, z]) => { const ap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 20, 14), appleMat)); ap.position.set(x * s, H * 0.92, z * s); group.add(ap); });
      const milk = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.42 * s, 0.16 * s), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }))); milk.position.set(-0.32 * s, H * 0.75, 0.12 * s); group.add(milk);
      return { group, top: H + W * 0.42, anchor: () => new THREE.Vector3(W * 0.3, H * 0.5, D / 2), update() {} };
    },
  },
  // A pizza on a board, cut into "slices" equal slices; your "mine" slices are pulled a little way out from the rest;
  // "left": only that many slices are still on the board.
  pizza: {
    build(a, ctx) {
      const R = Math.min(a.w || 190, a.h || 190) * ctx.S * 0.48, T = 0.06;
      const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
      const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256); gr.addColorStop(0, '#e8b84a'); gr.addColorStop(0.82, '#d9a03a'); gr.addColorStop(0.9, '#c0702e'); gr.addColorStop(1, '#a8652b');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(' + (200 + rnd() * 50) + ',' + (120 + rnd() * 60) + ',40,0.35)'; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, 3 + rnd() * 10, 0, 7); g.fill(); }
      for (let i = 0; i < 14; i++) { const ang = rnd() * 7, rr = 40 + rnd() * 160; g.fillStyle = '#9e2a22'; g.beginPath(); g.arc(256 + Math.cos(ang) * rr, 256 + Math.sin(ang) * rr, 22, 0, 7); g.fill(); g.fillStyle = 'rgba(60,10,8,0.35)'; g.beginPath(); g.arc(256 + Math.cos(ang) * rr + 4, 256 + Math.sin(ang) * rr + 4, 18, 0, 7); g.fill(); }
      const top = new THREE.CanvasTexture(c); top.colorSpace = THREE.SRGBColorSpace;
      const crust = new THREE.MeshStandardMaterial({ color: 0xb87a3e, roughness: 0.85 }), face = new THREE.MeshStandardMaterial({ map: top, roughness: 0.6 });
      const group = new THREE.Group();
      const boardMat = new THREE.MeshStandardMaterial({ map: weathered('#b08a5c'), roughness: 0.7 });
      const brd = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.05, 64), boardMat)); brd.position.y = 0.025; group.add(brd);
      const holder = new THREE.Group(); holder.position.y = 0.05; group.add(holder);
      let built = -1, mineN = -1, left = 0, leftN = -1;
      const cut = (n, mine) => {
        if (n === built && mine === mineN && left === leftN) return; built = n; mineN = mine; leftN = left;
        while (holder.children.length) { const m = holder.children.pop(); m.geometry.dispose(); }
        for (let i = 0; i < n; i++) {
          if (left && i >= left) break;
          const t0 = (i / n) * Math.PI * 2, dt = (Math.PI * 2) / n;
          const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, Math.max(4, Math.round(64 / n)), 1, false, t0 + 0.004, dt - 0.008), [crust, face, crust]));
          const mid = t0 + dt / 2, out = i < mine ? 0.3 * R : 0;
          m.position.set(Math.sin(mid) * out, T / 2, Math.cos(mid) * out); holder.add(m);
        }
      };
      return {
        group, top: 0.12, anchor: () => new THREE.Vector3(R * 0.55, 0.08, R * 0.75),
        update(A, B, e) { const S = e < 0.5 ? A : B; left = num(S, 'left'); cut(num(S, 'slices') || 8, num(S, 'mine')); },
      };
    },
  },
  // A large silver coin, heads (a star) up. "up": true tosses it into the air, turning over and over; "face": "tails"
  // lands it showing the 1, and a change of face flips it.
  coin: {
    build(a, ctx) {
      const r = Math.min(a.w || 100, a.h || 100) * ctx.S * 0.36, t = 0.05;
      const face = (mark) => {
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
        g.fillStyle = '#bfc3c7'; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = '#8e9398'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 98, 0, 7); g.stroke();
        for (let i = 0; i < 60; i++) { const an = (i / 60) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(an) * 104, 128 + Math.sin(an) * 104); g.lineTo(128 + Math.cos(an) * 110, 128 + Math.sin(an) * 110); g.stroke(); }
        g.fillStyle = '#8e9398'; g.font = '800 120px "VU Print"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 128, 136);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
      };
      const metal = (tx) => new THREE.MeshStandardMaterial({ map: tx, bumpMap: tx, bumpScale: 1.5, metalness: 0.85, roughness: 0.3, envMap: ctx.env, envMapIntensity: 2 });
      const edge = new THREE.MeshStandardMaterial({ color: 0xb4b8bc, metalness: 1, roughness: 0.4, envMap: ctx.env });
      const coin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 64), [edge, metal(face('★')), metal(face('1'))]));
      const spin = new THREE.Group(); spin.position.y = t / 2; spin.add(coin);
      const group = new THREE.Group(); group.add(spin);
      return {
        group, top: t, anchor: () => new THREE.Vector3(r * 0.7, t, r * 0.7),
        update(A, B, e) {
          const u = lerp(flag(A, 'up'), flag(B, 'up'), e), moving = flag(A, 'up') !== flag(B, 'up');
          const fa = A && A.face === 'tails' ? 1 : 0, fb = B && B.face === 'tails' ? 1 : 0, turning = fa !== fb;
          spin.position.y = t / 2 + u * 1.1 * Math.max(r * 3, 0.8) + (moving || turning ? Math.sin(Math.PI * e) * 0.6 : 0);
          coin.rotation.x = u * 0.9 + lerp(fa, fb, e) * Math.PI + (moving ? e * Math.PI * 6 : turning ? e * Math.PI * 4 : 0);
        },
      };
    },
  },
  // A product box on a shelf: its front and back printed from "front" and "back" ("look": "shiny" or "plain").
  // "turned": true turns it round to show its back.
  box: {
    build(a, ctx) {
      const s = Math.min(a.w || 120, 140) * ctx.S, W = 0.8 * s, H = 1.15 * s, D = 0.28 * s, shiny = a.look === 'shiny';
      const side = (front) => {
        const c = document.createElement('canvas'); c.width = 384; c.height = 552; const g = c.getContext('2d');
        if (front && shiny) { const gr = g.createLinearGradient(0, 0, 384, 552); gr.addColorStop(0, '#f6cf4a'); gr.addColorStop(0.5, '#e8a21c'); gr.addColorStop(1, '#f7d861'); g.fillStyle = gr; }
        else g.fillStyle = shiny ? '#e9b53a' : '#f2efe6';
        g.fillRect(0, 0, 384, 552);
        const text = front ? a.front : a.back;
        if (text) {
          g.fillStyle = front && shiny ? '#b3121f' : '#2a2724'; g.textAlign = 'center'; g.textBaseline = 'middle';
          const words = String(text).split(' '), lines = []; let cur = '';
          g.font = (front ? '800 54px "VU Print"' : '500 26px "VU Print"');
          words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > 320) { lines.push(cur); cur = w; } else cur = t; });
          if (cur) lines.push(cur);
          const lh = front ? 64 : 34, y0 = front ? 276 - (lines.length - 1) * lh / 2 : 60;
          lines.forEach((l, i) => g.fillText(l, 192, y0 + i * lh));
          if (!front) { g.strokeStyle = '#2a2724'; g.lineWidth = 3; g.strokeRect(24, 30, 336, 492); }
        }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
      };
      const plainSide = new THREE.MeshStandardMaterial({ color: shiny ? 0xe0a62a : 0xe6e1d4, roughness: shiny ? 0.25 : 0.8, metalness: shiny ? 0.3 : 0, envMap: ctx.env, envMapIntensity: shiny ? 1 : 0.2 });
      const mf = new THREE.MeshStandardMaterial({ map: side(true), roughness: shiny ? 0.22 : 0.8, metalness: shiny ? 0.25 : 0, envMap: ctx.env, envMapIntensity: shiny ? 1 : 0.2 });
      const mb = new THREE.MeshStandardMaterial({ map: side(false), roughness: 0.8 });
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [plainSide, plainSide, plainSide, plainSide, mf, mb]));
      const spin = new THREE.Group(); spin.position.y = H / 2; spin.add(box);
      const group = new THREE.Group(); group.add(spin);
      return {
        group, top: H, anchor: () => new THREE.Vector3(W * 0.35, 0.15 * s, D / 2),
        update(A, B, e) { spin.rotation.y = lerp(flag(A, 'turned'), flag(B, 'turned'), e) * Math.PI; spin.position.y = H / 2 + Math.sin(Math.PI * Math.abs(flag(B, 'turned') - flag(A, 'turned')) * e) * 0.2; },
      };
    },
  },
  // A round mirror on a little wooden stand, tipped back, facing you. Its glass reflects the room.
  mirror: {
    build(a, ctx) {
      const s = Math.min(a.w || 120, a.h || 120) * ctx.S, R = 0.42 * s;
      const wood = new THREE.MeshStandardMaterial({ map: weathered('#6e4a2c'), roughness: 0.6 });
      const group = new THREE.Group(), face = new THREE.Group(); face.position.y = 0.1 * s + R * 1.05; face.rotation.x = -0.15; group.add(face);
      face.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, 0.05 * s, 16, 64), wood)));
      const glass = new THREE.Mesh(new THREE.CircleGeometry(R * 0.99, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04, envMap: ctx.env, envMapIntensity: 3 }));
      glass.position.z = 0.005; face.add(glass);
      const back = shadowed(new THREE.Mesh(new THREE.CircleGeometry(R, 48), wood)); back.rotation.y = Math.PI; back.position.z = -0.01; face.add(back);
      const post = board(0.05 * s, R * 1.2, 0.05 * s, wood); post.position.set(0, (R * 1.2) / 2, -0.12 * s); post.rotation.x = 0.25; group.add(post);
      const foot = board(0.5 * s, 0.05 * s, 0.32 * s, wood); foot.position.y = 0.025 * s; group.add(foot);
      return { group, top: face.position.y + R, anchor: () => new THREE.Vector3(R * 0.5, 0.05 * s, 0.14 * s), update() {} };
    },
  },
  // A twin-bell alarm clock. "time": the hour it shows (5.5 is half past five).
  alarm: {
    build(a, ctx) {
      const s = Math.min(a.w || 140, a.h || 140) * ctx.S, R = 0.3 * s, D = 0.16 * s;
      const enamel = new THREE.MeshStandardMaterial({ color: 0x9b1f1f, metalness: 0.3, roughness: 0.35, envMap: ctx.env, envMapIntensity: 0.8 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xd6d9dc, metalness: 1, roughness: 0.2, envMap: ctx.env, envMapIntensity: 1.4 });
      const group = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.09 * s + R; group.add(body);
      const can = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R, R, D, 48), enamel)); can.rotation.x = Math.PI / 2; body.add(can);
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 30px "VU Print"';
      for (let h = 1; h <= 12; h++) { const an = (h / 12) * Math.PI * 2; g.fillText(String(h), 128 + Math.sin(an) * 96, 128 - Math.cos(an) * 96); }
      for (let m = 0; m < 60; m++) { const an = (m / 60) * Math.PI * 2, r0 = m % 5 ? 116 : 110; g.fillRect(128 + Math.sin(an) * r0 - 1, 128 - Math.cos(an) * r0 - 1, 2, 2); }
      const dial = new THREE.CanvasTexture(c); dial.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 48), new THREE.MeshStandardMaterial({ map: dial, roughness: 0.5 })); face.position.z = D / 2 + 0.002; body.add(face);
      const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.025 * s, 10, 48), chrome)); rim.position.z = D / 2; body.add(rim);
      const hand = (len, w) => { const h = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.006), new THREE.MeshStandardMaterial({ color: 0x111111 })); m.position.y = len / 2; h.add(m); h.position.z = D / 2 + 0.008; body.add(h); return h; };
      const hr = hand(R * 0.45, 0.03 * s), mn = hand(R * 0.7, 0.02 * s);
      [-1, 1].forEach((sd) => {
        const bell = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), chrome)); bell.position.set(sd * 0.2 * s, R + 0.06 * s, 0); bell.rotation.z = -sd * 0.5; body.add(bell);
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.13 * s, 10), chrome)); leg.position.set(sd * 0.18 * s, -R - 0.02 * s, 0); leg.rotation.z = sd * 0.35; body.add(leg);
      });
      const hammer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.14 * s, 8), chrome)); hammer.position.set(0, R + 0.1 * s, 0); body.add(hammer);
      return {
        group, top: body.position.y + R + 0.2 * s, anchor: () => new THREE.Vector3(R * 0.6, 0.06 * s, D / 2),
        update(A, B, e) {
          const t = lerp(num(A, 'time') || num(B, 'time'), num(B, 'time') || num(A, 'time'), e);
          hr.rotation.z = -((t % 12) / 12) * Math.PI * 2; mn.rotation.z = -((t % 1) * Math.PI * 2);
          hammer.rotation.z = B && B.shake ? Math.sin(e * 60) * 0.5 : 0;
        },
      };
    },
  },
  // A pot of yogurt with a foil lid and a printed band; its front reads "front".
  yogurt: {
    build(a, ctx) {
      const s = Math.min(a.w || 140, a.h || 140) * ctx.S, r0 = 0.2 * s, r1 = 0.28 * s, H = 0.42 * s;
      const prof = [[0, 0], [r0, 0], [r1, H], [r1 + 0.01 * s, H + 0.015 * s], [0, H + 0.015 * s]].map(([x, y]) => new THREE.Vector2(x, y));
      const group = new THREE.Group();
      group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.4 }))));
      // printed three times round the band, as pots are, so it reads from wherever you stand
      const c = document.createElement('canvas'); c.width = 1536; c.height = 256; const g = c.getContext('2d');
      const tone = a.look === 'gold' ? ['#f3c64a', '#7a4a06'] : ['#9ad08a', '#1d5c2a'];
      g.fillStyle = tone[0]; g.fillRect(0, 0, 1536, 256); g.fillStyle = '#fff'; g.fillRect(0, 0, 1536, 30); g.fillRect(0, 226, 1536, 30);
      g.fillStyle = tone[1]; g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 74; do { g.font = '800 ' + fs + 'px "VU Print"'; fs -= 4; } while (g.measureText(String(a.front || '')).width > 440 && fs > 20);
      [256, 768, 1280].forEach((x) => g.fillText(String(a.front || ''), x, 132));
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
      const band = [[r0 + (r1 - r0) * 0.2 + 0.004, H * 0.2], [r0 + (r1 - r0) * 0.85 + 0.004, H * 0.85]].map(([x, y]) => new THREE.Vector2(x, y));
      group.add(new THREE.Mesh(new THREE.LatheGeometry(band, 64, -Math.PI, Math.PI * 2), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.45 })));
      const foil = new THREE.Mesh(new THREE.CircleGeometry(r1 + 0.012 * s, 48), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.35, envMap: ctx.env })); foil.rotation.x = -Math.PI / 2; foil.position.y = H + 0.017 * s; group.add(foil);
      return { group, top: H + 0.02 * s, anchor: () => new THREE.Vector3(r1 * 0.7, H * 0.15, r1 * 0.7), update() {} };
    },
  },
  // A free sample: a cube of cheese on a toothpick, on a small paper plate. "eaten": true leaves only the toothpick.
  sample: {
    build(a, ctx) {
      const s = Math.min(a.w || 120, a.h || 120) * ctx.S;
      const group = new THREE.Group();
      const plate = [[0, 0], [0.22 * s, 0], [0.3 * s, 0.04 * s], [0.29 * s, 0.045 * s], [0.21 * s, 0.01 * s], [0, 0.01 * s]].map(([x, y]) => new THREE.Vector2(x, y));
      group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(plate, 40), new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.9 }))));
      const cube = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.1 * s, 0.12 * s), new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6 }))); cube.position.y = 0.06 * s; group.add(cube);
      const pick = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.22 * s, 6), new THREE.MeshStandardMaterial({ color: 0xd8b88a, roughness: 0.8 }))); group.add(pick);
      return {
        group, top: 0.25 * s, anchor: () => new THREE.Vector3(0.24 * s, 0.03 * s, 0.12 * s),
        update(A, B, e) {
          const k = lerp(flag(A, 'eaten'), flag(B, 'eaten'), e);
          cube.visible = k < 0.5; pick.position.set(0, lerp(0.15 * s, 0.02 * s, k), 0); pick.rotation.z = lerp(0, Math.PI / 2 - 0.2, k);
        },
      };
    },
  },
  // A wedge of cheese with its rind, a few holes on the cut face.
  cheese: {
    build(a, ctx) {
      const s = Math.min(a.w || 160, a.h || 160) * ctx.S, R = 0.55 * s, H = 0.32 * s;
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, R, -0.45, 0.45, false); sh.lineTo(0, 0);
      [[0.25, 0.04], [0.38, -0.08], [0.31, 0.12]].forEach(([x, y]) => { const hole = new THREE.Path(); hole.absarc(x * s, y * s, 0.035 * s, 0, Math.PI * 2, true); sh.holes.push(hole); });
      const geo = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: true, bevelThickness: 0.01 * s, bevelSize: 0.01 * s, bevelSegments: 2, curveSegments: 24 });
      geo.rotateX(-Math.PI / 2);
      const m = shadowed(new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: 0xf2cd5c, roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: 0xc98f2e, roughness: 0.7 })]));
      m.rotation.y = Math.PI / 2 + 0.3; m.position.set(-0.1 * s, 0, 0.25 * s);
      const group = new THREE.Group(); group.add(m);
      return { group, top: H, anchor: () => new THREE.Vector3(0.1 * s, H * 0.3, 0.3 * s), update() {} };
    },
  },
  // A tin of paint with its lid off, a drip down the side, and a brush laid across the top.
  paint: {
    build(a, ctx) {
      const s = Math.min(a.w || 130, a.h || 130) * ctx.S, R = 0.3 * s, H = 0.5 * s;
      const tin = new THREE.MeshStandardMaterial({ color: 0xc4c7ca, metalness: 0.9, roughness: 0.35, envMap: ctx.env, envMapIntensity: 1 });
      const paintMat = new THREE.MeshStandardMaterial({ color: 0x3f7fb5, roughness: 0.25, envMap: ctx.env, envMapIntensity: 0.4 });
      const group = new THREE.Group();
      const can = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true), tin)); can.position.y = H / 2; group.add(can);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.003, R + 0.003, H * 0.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xece6d6, roughness: 0.7 })); band.position.y = H * 0.45; group.add(band);
      const top = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 48), paintMat); top.rotation.x = -Math.PI / 2; top.position.y = H * 0.92; group.add(top);
      const lip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, 0.015 * s, 8, 48), tin)); lip.rotation.x = Math.PI / 2; lip.position.y = H; group.add(lip);
      const drip = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.025 * s, 0.16 * s, 6, 10), paintMat)); drip.position.set(R * 0.3, H * 0.82, R * 0.96); group.add(drip);
      const brush = new THREE.Group(); brush.position.set(0, H + 0.03 * s, 0); brush.rotation.y = 0.5; group.add(brush);
      const handle = board(0.6 * s, 0.04 * s, 0.07 * s, new THREE.MeshStandardMaterial({ map: birch(), roughness: 0.6 })); handle.position.x = -0.12 * s; brush.add(handle);
      const ferrule = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.06 * s, 0.12 * s), tin)); ferrule.position.x = 0.22 * s; brush.add(ferrule);
      const bristles = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.05 * s, 0.12 * s), paintMat)); bristles.position.x = 0.33 * s; brush.add(bristles);
      return { group, top: H + 0.08 * s, anchor: () => new THREE.Vector3(R * 0.6, H * 0.3, R * 0.85), update() {} };
    },
  },
  // A cinema ticket on card stock with a perforated stub. "torn": true tears the stub off, and it slides away.
  ticket: {
    build(a, ctx) {
      const s = (a.w || 200) * ctx.S, W = 0.92 * s, D = 0.44 * s, T = 0.006, cut = 0.72;
      const c = document.createElement('canvas'); c.width = 1024; c.height = 490; const g = c.getContext('2d');
      noise(g, 1024, 490, '#efd8a6', 14);
      g.strokeStyle = '#a3281c'; g.lineWidth = 8; g.strokeRect(22, 22, 980, 446); g.lineWidth = 2; g.strokeRect(36, 36, 952, 418);
      g.fillStyle = '#a3281c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 104px "VU Print"'; g.fillText('ADMIT ONE', 372, 170);
      g.fillStyle = '#2c2420'; g.font = '500 34px "VU Print"'; g.fillText('CINEMA 4   ROW F   SEAT 12', 372, 272);
      g.font = '800 70px "VU Print"'; g.fillText('$15.00', 372, 368);
      g.fillStyle = 'rgba(60,40,30,0.75)'; for (let y = 30; y < 470; y += 16) { g.beginPath(); g.arc(737, y, 3.2, 0, 7); g.fill(); }
      g.save(); g.translate(880, 245); g.rotate(-Math.PI / 2); g.fillStyle = '#a3281c'; g.font = '800 54px "VU Print"'; g.fillText('ADMIT ONE', 0, -28); g.fillStyle = '#2c2420'; g.font = '500 28px "VU Print"'; g.fillText('No 004817', 0, 34); g.restore();
      const part = (u0, u1) => {
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(u1 - u0, 1); t.offset.set(u0, 0);
        const edge = new THREE.MeshStandardMaterial({ color: 0xe6cf9c, roughness: 0.9 });
        const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * (u1 - u0), T, D), [edge, edge, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), edge, edge, edge]));
        m.position.set(-W / 2 + W * (u0 + u1) / 2, T / 2 + 0.002, 0); return m;
      };
      const group = new THREE.Group(), main = part(0, cut), stub = part(cut, 1), home = stub.position.clone();
      group.add(main, stub); group.rotation.y = 0.06;
      return {
        group, top: T, anchor: () => new THREE.Vector3(-W * 0.36, T, D * 0.38),
        update(A, B, e) {
          const k = lerp(flag(A, 'torn'), flag(B, 'torn'), e), moving = flag(A, 'torn') !== flag(B, 'torn');
          stub.position.set(home.x + k * 0.16 * s, home.y + (moving ? Math.sin(Math.PI * e) * 0.08 * s : 0), home.z + k * 0.06 * s);
          stub.rotation.set(0, -0.3 * k, moving ? Math.sin(Math.PI * e) * 0.15 : 0);
        },
      };
    },
  },
  // A doorway in a short piece of wall with a lit EXIT sign over it. "open": true swings the door toward you and the
  // light from outside spills onto the table.
  door: {
    build(a, ctx) {
      const s = Math.min(a.w || 150, a.h || 150) * ctx.S, W = 0.46 * s, H = 0.82 * s, WW = W + 0.5 * s, WH = H + 0.3 * s, D = 0.1 * s;
      const plaster = new THREE.MeshStandardMaterial({ color: 0x8c857b, roughness: 0.95 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x55636c, metalness: 0.5, roughness: 0.45, envMap: ctx.env, envMapIntensity: 0.6 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d3d6, metalness: 1, roughness: 0.25, envMap: ctx.env, envMapIntensity: 1.2 });
      const group = new THREE.Group();
      const wall = new THREE.Shape(); wall.moveTo(-WW / 2, 0); wall.lineTo(WW / 2, 0); wall.lineTo(WW / 2, WH); wall.lineTo(-WW / 2, WH); wall.closePath();
      const hole = new THREE.Path(); hole.moveTo(-W / 2, 0.001); hole.lineTo(-W / 2, H); hole.lineTo(W / 2, H); hole.lineTo(W / 2, 0.001); hole.closePath(); wall.holes.push(hole);
      const wg = new THREE.ExtrudeGeometry(wall, { depth: D, bevelEnabled: false }); wg.translate(0, 0, -D / 2);
      group.add(shadowed(new THREE.Mesh(wg, plaster)));
      const foot = board(WW, 0.05 * s, 0.4 * s, new THREE.MeshStandardMaterial({ color: 0x5b5048, roughness: 0.8 })); foot.position.set(0, 0.025 * s, -0.15 * s); group.add(foot);
      // the frame round the opening
      [[-W / 2 - 0.02 * s, H / 2, 0.04 * s, H], [W / 2 + 0.02 * s, H / 2, 0.04 * s, H], [0, H + 0.02 * s, W + 0.08 * s, 0.04 * s]].forEach(([x, y, w, h]) => { const f = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, D * 1.3), steel)); f.position.set(x, y, 0); group.add(f); });
      // daylight beyond, seen only through the doorway
      const out = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0xfff0d2 })); out.position.set(0, H / 2, -D / 2 - 0.004); group.add(out);
      const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, D / 2 - 0.02 * s); group.add(hinge);
      const leaf = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W - 0.01 * s, H - 0.01 * s, 0.035 * s), steel)); leaf.position.set(W / 2, H / 2, 0); hinge.add(leaf);
      const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014 * s, 0.014 * s, W * 0.75, 12), chrome)); bar.rotation.z = Math.PI / 2; bar.position.set(W / 2, H * 0.46, 0.035 * s); hinge.add(bar);
      [0.15, 0.85].forEach((u) => { const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.025 * s, 0.04 * s, 0.035 * s), chrome)); b.position.set(W * u, H * 0.46, 0.02 * s); hinge.add(b); });
      // the sign: a green panel with white letters, lit from inside
      const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
      g.fillStyle = '#0b7a3b'; g.fillRect(0, 0, 512, 160); g.fillStyle = '#f4fff6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 104px "VU Print"'; g.fillText('EXIT', 220, 86);
      g.beginPath(); g.moveTo(380, 60); g.lineTo(430, 60); g.lineTo(430, 38); g.lineTo(478, 80); g.lineTo(430, 122); g.lineTo(430, 100); g.lineTo(380, 100); g.closePath(); g.fill();
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const case_ = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.5 });
      const sign = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, W * 0.3, 0.07 * s), [case_, case_, case_, case_, new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 1.1, roughness: 0.4 }), case_]));
      sign.position.set(0, H + 0.04 * s + W * 0.17, D / 2 + 0.035 * s); group.add(sign);
      const glow = new THREE.PointLight(0x46ff8c, 0, 2.2 * s, 2); glow.position.set(0, sign.position.y, D / 2 + 0.3 * s); group.add(glow);
      const spill = new THREE.PointLight(0xffd9a0, 0, 4 * s, 2); spill.position.set(0, H * 0.45, D / 2 + 0.35 * s); group.add(spill);
      const seen = (v) => (v && v.o != null ? v.o : 1);
      return {
        group, top: WH, anchor: () => new THREE.Vector3(WW * 0.38, 0.05 * s, D / 2),
        update(A, B, e) {
          const k = lerp(flag(A, 'open'), flag(B, 'open'), e), v = lerp(seen(A), seen(B), e);
          hinge.rotation.y = -1.15 * k; glow.intensity = 1.2 * v; spill.intensity = 5 * k * v;
        },
      };
    },
  },
  // A bunch of keys on a split ring: a brass house key, a steel key and a leather fob, lying on the table.
  keys: {
    build(a, ctx) {
      const s = Math.min(a.w || 100, a.h || 100) * ctx.S * 1.8, rr = 0.12 * s;
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24c, metalness: 1, roughness: 0.3, envMap: ctx.env, envMapIntensity: 1.3 });
      const steel = new THREE.MeshStandardMaterial({ color: 0xc3c7cb, metalness: 1, roughness: 0.28, envMap: ctx.env, envMapIntensity: 1.3 });
      const leather = new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.7 });
      const group = new THREE.Group(), lay = new THREE.Group(); lay.rotation.y = -0.5; group.add(lay);
      const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(rr, 0.012 * s, 10, 48), steel)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.014 * s; lay.add(ring);
      // a key in outline: a round bow with a hole for the ring, a blade with cut teeth along one edge
      const key = (L, mat, ang, lift) => {
        const rb = 0.085 * s, hw = 0.032 * s, a0 = Math.asin(hw / rb), sh = new THREE.Shape();
        sh.moveTo(rb * Math.cos(a0), hw); sh.lineTo(L - 0.05 * s, hw); sh.lineTo(L, 0); sh.lineTo(L - 0.02 * s, -hw);
        const teeth = [0.02, 0.045, 0.015, 0.04, 0.025, 0.035];
        teeth.forEach((d, i) => { const x = L - 0.06 * s - i * (L - rb - 0.08 * s) / teeth.length; sh.lineTo(x, -hw - d * s); sh.lineTo(x - 0.03 * s, -hw); });
        sh.lineTo(rb * Math.cos(a0), -hw); sh.absarc(0, 0, rb, -a0, a0, true);
        const h = new THREE.Path(); h.absarc(-0.035 * s, 0, 0.026 * s, 0, Math.PI * 2, true); sh.holes.push(h);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.014 * s, bevelEnabled: true, bevelThickness: 0.003 * s, bevelSize: 0.003 * s, bevelSegments: 2, curveSegments: 24 });
        geo.rotateX(-Math.PI / 2);
        const m = shadowed(new THREE.Mesh(geo, mat)), k = new THREE.Group(); k.add(m);
        m.position.set(0.035 * s, 0, 0); // the hole sits on the ring
        k.position.set(Math.cos(ang) * rr, lift, -Math.sin(ang) * rr); k.rotation.y = ang; k.rotation.z = 0.04;
        lay.add(k);
      };
      key(0.6 * s, brass, -0.25, 0.004 * s); key(0.52 * s, steel, 0.55, 0.02 * s);
      const fob = new THREE.Shape(); fob.moveTo(0, -0.05 * s); fob.lineTo(0.22 * s, -0.06 * s); fob.absarc(0.22 * s, 0, 0.06 * s, -Math.PI / 2, Math.PI / 2, false); fob.lineTo(0, 0.05 * s); fob.closePath();
      const fh = new THREE.Path(); fh.absarc(0.025 * s, 0, 0.018 * s, 0, Math.PI * 2, true); fob.holes.push(fh);
      const fg = new THREE.ExtrudeGeometry(fob, { depth: 0.022 * s, bevelEnabled: true, bevelThickness: 0.005 * s, bevelSize: 0.005 * s, bevelSegments: 3 }); fg.rotateX(-Math.PI / 2);
      const fm = shadowed(new THREE.Mesh(fg, leather)); fm.position.set(Math.cos(2.6) * rr, 0.004 * s, -Math.sin(2.6) * rr); fm.rotation.y = 2.6 + 0.2; lay.add(fm);
      return { group, top: 0.05 * s, anchor: () => new THREE.Vector3(0, 0.02 * s, rr).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5), update() {} };
    },
  },
  // A die-cast toy car in glossy red: a body cut from its side view, glass all round, chrome bumpers, four wheels.
  // Its window carries the price sticker: the tag's string ties to the side glass.
  car: {
    build(a, ctx) {
      const L = (a.w || 220) * ctx.S * 0.85, Wd = 0.42 * L, rw = 0.085 * L, xw = 0.3 * L, ar = 0.105 * L, by = 0.06 * L;
      const paint = new THREE.MeshPhysicalMaterial({ color: 0x9c1a1a, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMap: ctx.env, envMapIntensity: 1.3 });
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x18222b, metalness: 0.3, roughness: 0.05, envMap: ctx.env, envMapIntensity: 1.6 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dbde, metalness: 1, roughness: 0.18, envMap: ctx.env, envMapIntensity: 1.4 });
      const rubber = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.85 });
      const sh = new THREE.Shape(), a0 = Math.asin((rw - by) / ar);
      sh.moveTo(-0.5 * L, by + 0.02 * L); sh.lineTo(-0.5 * L, 0.26 * L); sh.quadraticCurveTo(-0.5 * L, 0.3 * L, -0.44 * L, 0.3 * L);
      sh.lineTo(0.2 * L, 0.3 * L); sh.lineTo(0.46 * L, 0.27 * L); sh.quadraticCurveTo(0.5 * L, 0.265 * L, 0.5 * L, 0.21 * L); sh.lineTo(0.5 * L, by + 0.02 * L); sh.quadraticCurveTo(0.5 * L, by, 0.47 * L, by);
      sh.lineTo(xw + ar * Math.cos(a0), by); sh.absarc(xw, rw, ar, -a0, Math.PI + a0, false);
      sh.lineTo(-xw + ar * Math.cos(a0), by); sh.absarc(-xw, rw, ar, -a0, Math.PI + a0, false);
      sh.lineTo(-0.47 * L, by); sh.quadraticCurveTo(-0.5 * L, by, -0.5 * L, by + 0.02 * L);
      const bevel = 0.025 * L, bg = new THREE.ExtrudeGeometry(sh, { depth: Wd - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.015 * L, bevelSegments: 5, curveSegments: 32 });
      bg.translate(0, 0, -(Wd - 2 * bevel) / 2);
      const car = new THREE.Group(); car.rotation.y = -0.42;
      car.add(shadowed(new THREE.Mesh(bg, paint)));
      // the cabin in paint, narrowing toward the roof; glass set into its sides, front and back
      const gh = new THREE.Shape(); gh.moveTo(-0.31 * L, 0.29 * L); gh.lineTo(-0.17 * L, 0.43 * L); gh.lineTo(0.05 * L, 0.43 * L); gh.lineTo(0.21 * L, 0.29 * L); gh.closePath();
      const gt = 0.02 * L, gd = Wd * 0.8, gg = new THREE.ExtrudeGeometry(gh, { depth: gd, bevelEnabled: true, bevelThickness: gt, bevelSize: 0.012 * L, bevelSegments: 4 }); gg.translate(0, 0, -gd / 2);
      const narrow = (y) => 1 - 0.12 * Math.min(1, Math.max(0, (y - 0.3 * L) / (0.14 * L)));
      { const p = gg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * narrow(p.getY(i))); gg.computeVertexNormals(); }
      const cab = new THREE.Group(); car.add(cab);
      cab.add(shadowed(new THREE.Mesh(gg, paint)));
      const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.25 * L, 0.018 * L, (gd + 2 * gt) * 0.9), paint)); roof.position.set(-0.06 * L, 0.438 * L, 0); cab.add(roof);
      const glassD = new THREE.MeshPhysicalMaterial({ color: 0x141c24, metalness: 0.3, roughness: 0.04, envMap: ctx.env, envMapIntensity: 1.8, side: THREE.DoubleSide });
      const zAt = (y) => (gd / 2 + gt) * narrow(y), ym = 0.3625 * L, tilt = Math.atan((zAt(0.3 * L) - zAt(0.44 * L)) / (0.14 * L));
      const pane = (pts) => { const p = new THREE.Shape(); pts.forEach(([x, y], k) => (k ? p.lineTo(x * L, y * L - ym) : p.moveTo(x * L, y * L - ym))); p.closePath(); return new THREE.ShapeGeometry(p); };
      [[[-0.035, 0.31], [-0.035, 0.415], [0.04, 0.415], [0.175, 0.31]], [[-0.065, 0.31], [-0.065, 0.415], [-0.16, 0.415], [-0.265, 0.31]]].forEach((pts) => {
        [-1, 1].forEach((sd) => { const m = new THREE.Mesh(pane(pts), glassD); m.position.set(0, ym, sd * (zAt(ym) + 0.003)); m.rotation.x = -sd * tilt; cab.add(m); });
      });
      // windscreen and rear window, each lying on its sloped face
      [[[0.05, 0.43], [0.21, 0.29], 1], [[-0.17, 0.43], [-0.31, 0.29], -1]].forEach(([t, b, sd]) => {
        const dx = (b[0] - t[0]) * L, dy = (b[1] - t[1]) * L, len = Math.hypot(dx, dy), n = new THREE.Vector3(-dy * sd, dx * sd, 0).normalize();
        if (n.y < 0) n.negate();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(zAt(0.36 * L) * 1.7, len * 0.8), glassD);
        m.position.set((t[0] + b[0]) / 2 * L, (t[1] + b[1]) / 2 * L, 0).addScaledVector(n, gt + 0.004); m.lookAt(m.position.clone().add(n)); cab.add(m);
      });
      [0.52, -0.52].forEach((x) => { const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.03 * L, 0.05 * L, Wd * 0.96), chrome)); b.position.set(x * L, 0.11 * L, 0); car.add(b); });
      [-1, 1].forEach((sd) => {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.03 * L, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff1d0, emissiveIntensity: 0.6, roughness: 0.1 })); hl.scale.set(0.5, 1, 1); hl.position.set(0.5 * L, 0.21 * L, sd * Wd * 0.33); car.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.012 * L, 0.04 * L, 0.08 * L), new THREE.MeshStandardMaterial({ color: 0xa01010, emissive: 0x600000, roughness: 0.2 })); tl.position.set(-0.505 * L, 0.24 * L, sd * Wd * 0.34); car.add(tl);
      });
      [[xw, 1], [xw, -1], [-xw, 1], [-xw, -1]].forEach(([x, sd]) => {
        const w = new THREE.Group(); w.position.set(x, rw, sd * (Wd / 2 - 0.035 * L)); car.add(w);
        const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rw, rw, 0.07 * L, 32), rubber)); t.rotation.x = Math.PI / 2; w.add(t);
        const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rw * 0.55, rw * 0.55, 0.075 * L, 24), chrome)); hub.rotation.x = Math.PI / 2; w.add(hub);
      });
      const group = new THREE.Group(); group.add(car);
      return { group, top: 0.45 * L, anchor: () => new THREE.Vector3(-0.15 * L, 0.34 * L, (Wd * 0.4 + 0.02 * L) * 0.97).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.42), update() {} };
    },
  },
  // A twenty: a paper note printed in green with fine wavy lines, bowed a little as paper lies.
  bill: {
    build(a, ctx) {
      const s = (a.w || 200) * ctx.S, W = 0.9 * s, D = 0.42 * s;
      const c = document.createElement('canvas'); c.width = 1024; c.height = 478; const g = c.getContext('2d');
      noise(g, 1024, 478, '#dfe6d2', 12);
      g.strokeStyle = 'rgba(40,95,65,0.22)'; g.lineWidth = 1.2;
      for (let k = 0; k < 26; k++) { g.beginPath(); for (let x = 0; x <= 1024; x += 8) { const y = 40 + k * 15.5 + Math.sin(x / 38 + k * 0.7) * 7; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      g.strokeStyle = '#2f5d45'; g.lineWidth = 10; g.strokeRect(18, 18, 988, 442); g.lineWidth = 3; g.strokeRect(36, 36, 952, 406);
      g.fillStyle = '#e3e9d8'; g.beginPath(); g.ellipse(512, 239, 130, 160, 0, 0, 7); g.fill(); g.strokeStyle = '#2f5d45'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#2f5d45'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 170px "VU Print"'; g.fillText('20', 512, 245);
      g.font = '800 92px "VU Print"'; g.fillText('20', 120, 104); g.fillText('20', 904, 378);
      g.font = '800 56px "VU Print"'; g.fillText('TWENTY', 800, 110); g.fillText('TWENTY', 224, 380);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
      const geo = new THREE.PlaneGeometry(W, D, 32, 6), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i) / W + 0.5, v = p.getY(i) / D + 0.5; p.setZ(i, 0.012 * s * Math.sin(Math.PI * u) + 0.006 * s * v * v); }
      geo.computeVertexNormals(); geo.rotateX(-Math.PI / 2);
      const m = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85, side: THREE.DoubleSide })));
      m.position.y = 0.003; m.rotation.y = (a.id || 'a').charCodeAt(0) % 2 ? 0.08 : -0.1;
      const group = new THREE.Group(); group.add(m);
      return { group, top: 0.05 * s, anchor: () => new THREE.Vector3(-W * 0.38, 0.01 * s, D * 0.36), update() {} };
    },
  },
  // A toy shark lying on its belly: a turned body, grey above and pale beneath, with its fins and tail.
  shark: {
    build(a, ctx) {
      const L = (a.w || 200) * ctx.S * 0.9, R = 0.13 * L;
      const prof = [[0, 0], [0.03, 0.32], [0.1, 0.68], [0.25, 0.95], [0.45, 1], [0.65, 0.82], [0.85, 0.42], [0.97, 0.18], [1, 0]].map(([t, r]) => new THREE.Vector2(r * R, L / 2 - t * L));
      const geo = new THREE.LatheGeometry(prof, 48); geo.rotateZ(-Math.PI / 2); geo.scale(1, 1, 0.82);
      const p = geo.attributes.position, col = new THREE.Color(), top = new THREE.Color(0x5f7482), belly = new THREE.Color(0xe9e6df), cols = [];
      for (let i = 0; i < p.count; i++) { col.copy(top).lerp(belly, smooth((-p.getY(i) / R + 0.1) * 2.2)); cols.push(col.r, col.g, col.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4, envMap: ctx.env, envMapIntensity: 0.4 });
      const fin = new THREE.MeshPhysicalMaterial({ color: 0x5a6e7b, roughness: 0.45, clearcoat: 0.4, envMap: ctx.env, envMapIntensity: 0.4 });
      const body = new THREE.Group(); body.position.y = R * 0.98; body.rotation.y = -0.4;
      body.add(shadowed(new THREE.Mesh(geo, skin)));
      const flat = (pts, d) => { const sh = new THREE.Shape(); pts.forEach(([x, y], k) => (k ? sh.lineTo(x * L, y * L) : sh.moveTo(x * L, y * L))); const g = new THREE.ExtrudeGeometry(sh, { depth: d * L, bevelEnabled: true, bevelThickness: 0.006 * L, bevelSize: 0.006 * L, bevelSegments: 2 }); g.translate(0, 0, -d * L / 2); return shadowed(new THREE.Mesh(g, fin)); };
      const dorsal = flat([[0.09, 0], [-0.04, 0], [-0.06, 0.02], [-0.03, 0.17], [0.0, 0.16]], 0.018); dorsal.position.set(0.02 * L, R * 0.85, 0); body.add(dorsal);
      const tail = flat([[0.02, -0.03], [0.02, 0.03], [-0.1, 0.19], [-0.06, 0.04], [-0.04, 0], [-0.09, -0.1]], 0.014); tail.position.set(-0.48 * L, 0, 0); body.add(tail);
      [-1, 1].forEach((sd) => {
        const pf = flat([[0.06, 0], [-0.02, 0], [-0.1, -0.13], [-0.04, -0.12]], 0.012); pf.rotation.x = -sd * 1.25; pf.position.set(0.12 * L, -R * 0.45, sd * R * 0.6); body.add(pf);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018 * L, 12, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, envMap: ctx.env })); eye.position.set(0.39 * L, R * 0.12, sd * R * 0.5); body.add(eye);
        for (let k = 0; k < 4; k++) { const gl = new THREE.Mesh(new THREE.BoxGeometry(0.004 * L, R * 0.4, 0.004 * L), new THREE.MeshStandardMaterial({ color: 0x3e4c55 })); gl.position.set((0.27 - k * 0.025) * L, -R * 0.05, sd * R * 0.74); gl.rotation.x = sd * 0.25; body.add(gl); }
      });
      const group = new THREE.Group(); group.add(body);
      return { group, top: R * 1.8 + 0.17 * L, anchor: () => new THREE.Vector3(0, R * 0.4, R * 0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.4), update() {} };
    },
  },
  // A slot machine: a red cabinet, three reels behind a window, a lever with a red ball, a lamp on top. "stop": the
  // symbol each reel shows ([0, 0, 0] is three sevens); when it changes the lever is pulled and the reels spin.
  // "win": true lights the lamp.
  slot: {
    build(a, ctx) {
      const s = Math.min(a.w || 160, a.h || 160) * ctx.S, W = 0.72 * s, H = 0.85 * s, D = 0.4 * s, r = 0.16 * s, N = 8;
      const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x8e1414, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMap: ctx.env, envMapIntensity: 1 });
      const chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, metalness: 1, roughness: 0.18, envMap: ctx.env, envMapIntensity: 1.4 });
      const group = new THREE.Group();
      const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, H, D * 0.7), lacquer)); back.position.set(0, H / 2, -D * 0.15); group.add(back);
      const wy = 0.58 * H, ww = 0.84 * W, wh = 1.3 * r;
      const fr = new THREE.Shape(); fr.moveTo(-W / 2, 0); fr.lineTo(W / 2, 0); fr.lineTo(W / 2, H); fr.lineTo(-W / 2, H); fr.closePath();
      const hole = new THREE.Path(); hole.moveTo(-ww / 2, wy - wh / 2); hole.lineTo(-ww / 2, wy + wh / 2); hole.lineTo(ww / 2, wy + wh / 2); hole.lineTo(ww / 2, wy - wh / 2); hole.closePath(); fr.holes.push(hole);
      const fg = new THREE.ExtrudeGeometry(fr, { depth: D * 0.3, bevelEnabled: true, bevelThickness: 0.01 * s, bevelSize: 0.01 * s, bevelSegments: 3 }); fg.translate(0, 0, D * 0.2);
      group.add(shadowed(new THREE.Mesh(fg, lacquer)));
      [[0, wh / 2, ww + 0.03 * s, 0.015 * s], [0, -wh / 2, ww + 0.03 * s, 0.015 * s], [ww / 2, 0, 0.015 * s, wh], [-ww / 2, 0, 0.015 * s, wh]].forEach(([x, y, w, h]) => { const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02 * s), chrome)); b.position.set(x, wy + y, D / 2 + 0.012 * s); group.add(b); });
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: 0x0c0b0b })); dark.position.set(0, wy, D * 0.2 + 0.001); group.add(dark);
      // the reel strip: eight symbols round each drum, drawn turned so they stand upright at the front
      const c = document.createElement('canvas'); c.width = 128 * N; c.height = 160; const g = c.getContext('2d');
      g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, c.width, 160);
      const sym = ['7', 'cherry', 'BAR', 'lemon', 'plum', 'cherry', 'BAR', 'lemon'];
      sym.forEach((k, i) => {
        g.save(); g.translate(i * 128 + 64, 80); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle';
        if (k === '7') { g.fillStyle = '#c4161c'; g.font = '800 92px "VU Print"'; g.fillText('7', 0, 4); }
        else if (k === 'BAR') { g.fillStyle = '#151515'; g.fillRect(-58, -22, 116, 44); g.fillStyle = '#f6f1e4'; g.font = '800 34px "VU Print"'; g.fillText('BAR', 0, 2); }
        else if (k === 'cherry') { g.strokeStyle = '#2e7d32'; g.lineWidth = 5; g.beginPath(); g.moveTo(-14, 10); g.quadraticCurveTo(-4, -30, 14, -38); g.moveTo(16, 12); g.quadraticCurveTo(12, -20, 14, -38); g.stroke(); g.fillStyle = '#b3121f'; [[-16, 18], [16, 20]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 17, 0, 7); g.fill(); }); }
        else if (k === 'lemon') { g.fillStyle = '#f2cf2e'; g.beginPath(); g.ellipse(0, 0, 38, 26, 0, 0, 7); g.fill(); }
        else { g.fillStyle = '#6b2a7a'; g.beginPath(); g.arc(0, 4, 30, 0, 7); g.fill(); g.fillStyle = '#2e7d32'; g.fillRect(-3, -36, 6, 14); }
        g.restore();
      });
      const strip = new THREE.CanvasTexture(c); strip.colorSpace = THREE.SRGBColorSpace; strip.anisotropy = 8;
      const reelMat = [new THREE.MeshStandardMaterial({ map: strip, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x9a9da0, metalness: 0.8, roughness: 0.4 })];
      const reels = [-1, 0, 1].map((k) => {
        const geo = new THREE.CylinderGeometry(r, r, ww * 0.28, 48, 1); geo.rotateZ(Math.PI / 2);
        geo.groups.length = 0; geo.addGroup(0, 48 * 6, 0); geo.addGroup(48 * 6, Infinity, 1);
        const m = new THREE.Mesh(geo, reelMat); m.position.set(k * ww * 0.32, wy, D * 0.2 + 0.03 * s - r + r); group.add(m); return m;
      });
      reels.forEach((m) => { m.position.z = D / 2 - 0.03 * s - r; });
      const crown = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, D * 0.95, 32, 1, false, -Math.PI / 2, Math.PI), lacquer)); crown.rotation.x = -Math.PI / 2; crown.scale.set(1, 1, 0.45); crown.position.set(0, H, 0); group.add(crown);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xff9d00, emissiveIntensity: 0, roughness: 0.2 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 20, 14), lampMat); lamp.position.set(0, H + 0.16 * s, 0); group.add(lamp);
      { const jc = document.createElement('canvas'); jc.width = 512; jc.height = 160; const j = jc.getContext('2d');
        j.fillStyle = '#120d0a'; j.fillRect(0, 0, 512, 160); j.strokeStyle = '#d9a72b'; j.lineWidth = 6; j.strokeRect(10, 10, 492, 140);
        j.fillStyle = '#f2c14e'; j.font = '800 84px "VU Print"'; j.textAlign = 'center'; j.textBaseline = 'middle'; j.fillText('JACKPOT', 256, 84);
        const jt = new THREE.CanvasTexture(jc); jt.colorSpace = THREE.SRGBColorSpace;
        const belly = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.74, W * 0.74 * 160 / 512), new THREE.MeshStandardMaterial({ map: jt, emissive: 0xffffff, emissiveMap: jt, emissiveIntensity: 0.35, roughness: 0.15, envMap: ctx.env, envMapIntensity: 0.5 }));
        belly.position.set(0, 0.3 * H, D / 2 + 0.012 * s); group.add(belly); }
      const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.05 * s, 0.1 * s), chrome)); tray.position.set(0, 0.07 * s, D / 2 + 0.05 * s); group.add(tray);
      const strip2 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, 0.025 * s, D * 1.02), chrome)); strip2.position.set(0, 0.0125 * s, 0); group.add(strip2);
      const lever = new THREE.Group(); lever.position.set(W / 2 + 0.03 * s, 0.5 * H, 0); group.add(lever);
      const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.05 * s, 20), chrome)); hub.rotation.z = Math.PI / 2; lever.add(hub);
      const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.013 * s, 0.013 * s, 0.36 * s, 12), chrome)); arm.position.set(0.03 * s, 0.18 * s, 0); lever.add(arm);
      const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xc0141c, roughness: 0.2, clearcoat: 1, envMap: ctx.env }))); knob.position.set(0.03 * s, 0.37 * s, 0); lever.add(knob);
      const stops = (v) => (v && Array.isArray(v.stop) ? v.stop : null);
      const angle = (i) => ((i + 0.5) / N) * Math.PI * 2;
      return {
        group, top: H + 0.22 * s, anchor: () => new THREE.Vector3(-W * 0.3, 0.06 * s, D / 2),
        update(A, B, e) {
          const sa = stops(A) || stops(B) || [0, 0, 0], sb = stops(B) || sa, moving = sa.join() !== sb.join();
          reels.forEach((m, k) => {
            if (!moving) { m.rotation.x = angle(sb[k]); return; }
            const t = smooth(Math.min(1, e / (0.55 + k * 0.15))), to = angle(sb[k]) + Math.PI * 2 * (3 + k);
            m.rotation.x = lerp(angle(sa[k]), to, t);
          });
          lever.rotation.x = moving ? Math.sin(Math.PI * Math.min(1, e * 2.5)) * 1.1 : 0;
          lampMat.emissiveIntensity = lerp(flag(A, 'win'), flag(B, 'win'), e) * (1.6 + Math.sin(e * 40) * 0.6);
        },
      };
    },
  },
  // A phone leaning on a little stand, its screen lit. "screen": "feed", "likes" (a heart and 3 likes) or "quiet"
  // (notifications off).
  phone: {
    build(a, ctx) {
      const s = Math.min(a.w || 160, a.h || 160) * ctx.S, H = 0.95 * s, W = 0.46 * s, T = 0.04 * s, rc = 0.06 * s;
      const sh = new THREE.Shape(); sh.moveTo(-W / 2 + rc, -H / 2); sh.lineTo(W / 2 - rc, -H / 2); sh.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + rc); sh.lineTo(W / 2, H / 2 - rc); sh.quadraticCurveTo(W / 2, H / 2, W / 2 - rc, H / 2); sh.lineTo(-W / 2 + rc, H / 2); sh.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - rc); sh.lineTo(-W / 2, -H / 2 + rc); sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + rc, -H / 2);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: true, bevelThickness: 0.006 * s, bevelSize: 0.006 * s, bevelSegments: 4, curveSegments: 10 }); geo.translate(0, 0, -T);
      const shell = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.7, roughness: 0.35, envMap: ctx.env, envMapIntensity: 0.9 });
      const c = document.createElement('canvas'); c.width = 360; c.height = 740; const g = c.getContext('2d');
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const paint = (mode) => {
        g.fillStyle = '#12151a'; g.fillRect(0, 0, 360, 740);
        g.fillStyle = '#1f2b3b'; g.fillRect(0, 0, 360, 92); g.fillStyle = '#fff'; g.font = '700 30px "VU Print"'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Feed', 24, 60);
        g.strokeStyle = '#8a94a0'; g.lineWidth = 5; g.beginPath(); g.arc(180, 130, 16, 0.5, 5.6); g.stroke();
        for (let k = 0; k < 3; k++) { const y = 170 + k * 185; g.fillStyle = '#1e232b'; g.fillRect(16, y, 328, 170); g.fillStyle = ['#4f7cac', '#c08a3e', '#6a9a5b'][k]; g.beginPath(); g.arc(50, y + 34, 20, 0, 7); g.fill(); g.fillStyle = '#58606b'; g.fillRect(82, y + 22, 170, 12); g.fillRect(82, y + 42, 110, 10); g.fillStyle = ['#2c3e57', '#4a3a2a', '#2e4434'][k]; g.fillRect(28, y + 72, 304, 84); }
        if (mode === 'likes') {
          g.fillStyle = '#e0245e'; g.fillRect(20, 270, 320, 180);
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(180, 345); g.bezierCurveTo(120, 300, 140, 262, 180, 288); g.bezierCurveTo(220, 262, 240, 300, 180, 345); g.fill();
          g.textAlign = 'center'; g.font = '800 54px "VU Print"'; g.fillText('3 likes', 180, 400); g.textAlign = 'left';
        }
        if (mode === 'quiet') {
          g.fillStyle = '#2e6b45'; g.fillRect(20, 280, 320, 170);
          g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(70, 380); g.lineTo(70, 345); g.quadraticCurveTo(70, 318, 92, 318); g.quadraticCurveTo(114, 318, 114, 345); g.lineTo(114, 380); g.lineTo(62, 380); g.lineTo(122, 380); g.stroke(); g.strokeStyle = '#ff6b6b'; g.beginPath(); g.moveTo(58, 326); g.lineTo(126, 392); g.stroke();
          g.fillStyle = '#fff'; g.font = '800 40px "VU Print"'; g.fillText('Alerts off', 140, 362);
        }
        tx.needsUpdate = true;
      };
      paint(a.screen || 'feed'); let shown = a.screen || 'feed';
      const glass = new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, envMap: ctx.env, envMapIntensity: 0.6 });
      const tilt = new THREE.Group(); tilt.rotation.x = -0.6; tilt.position.set(0, H / 2 * Math.cos(0.6) + 0.02 * s, 0.05 * s);
      tilt.add(shadowed(new THREE.Mesh(geo, shell)));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, H * 0.92), glass); scr.position.z = 0.007 * s; tilt.add(scr);
      const group = new THREE.Group(); group.add(tilt);
      const standMat = new THREE.MeshStandardMaterial({ map: birch(), roughness: 0.6 });
      const lip = board(W * 1.1, 0.04 * s, 0.08 * s, standMat); lip.position.set(0, 0.02 * s, 0.05 * s + H / 2 * Math.sin(0.6) + 0.02 * s); group.add(lip);
      const prop = board(W * 0.6, H * 0.6, 0.03 * s, standMat); prop.rotation.x = 0.5; prop.position.set(0, H * 0.27, -H * 0.15); group.add(prop);
      return {
        group, top: H * Math.cos(0.6) + 0.05 * s, anchor: () => new THREE.Vector3(W * 0.5, 0.03 * s, 0.05 * s + H / 2 * Math.sin(0.6) + 0.04 * s),
        update(A, B) { const m = (B && B.screen) || (A && A.screen) || a.screen || 'feed'; if (m !== shown) { shown = m; paint(m); } },
      };
    },
  },
  // A felt fedora: a turned brim and a pinched crown with a dark ribbon band.
  hat: {
    build(a, ctx) {
      const s = Math.min(a.w || 140, a.h || 140) * ctx.S;
      const felt = new THREE.MeshPhysicalMaterial({ color: 0x4a3f36, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9a8a7a) });
      const V = (pts) => pts.map(([x, y]) => new THREE.Vector2(x * s, y * s));
      const group = new THREE.Group();
      const brim = shadowed(new THREE.Mesh(new THREE.LatheGeometry(V([[0.2, 0.035], [0.3, 0.03], [0.4, 0.045], [0.43, 0.065], [0.425, 0.075], [0.39, 0.06], [0.3, 0.045], [0.2, 0.05]]), 72), felt));
      brim.scale.set(1, 1, 0.88); group.add(brim);
      const crown = shadowed(new THREE.Mesh(new THREE.LatheGeometry(V([[0.215, 0.04], [0.225, 0.14], [0.215, 0.25], [0.19, 0.29], [0.11, 0.3], [0.04, 0.27], [0, 0.255]]), 72), felt));
      crown.scale.set(1, 1, 0.82); group.add(crown);
      const pinch = crown.geometry.attributes.position; for (let i = 0; i < pinch.count; i++) { const y = pinch.getY(i), z = pinch.getZ(i); if (y > 0.18 * s && z > 0.08 * s) pinch.setX(i, pinch.getX(i) * (1 - 0.18 * smooth((y - 0.18 * s) / (0.1 * s)) * smooth(z / (0.2 * s)))); } crown.geometry.computeVertexNormals();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.228 * s, 0.229 * s, 0.05 * s, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.5, side: THREE.DoubleSide })); band.scale.set(1, 1, 0.82); band.position.y = 0.075 * s; group.add(band);
      group.rotation.y = 0.5;
      return { group, top: 0.3 * s, anchor: () => new THREE.Vector3(0.3 * s, 0.05 * s, 0.25 * s), update() {} };
    },
  },
  // A tabletop scoreboard: a black box on two legs with HOME and AWAY and lit amber figures from "score" ("24-21").
  scoreboard: {
    build(a, ctx) {
      const s = Math.min(a.w || 180, a.h || 180) * ctx.S, W = 0.95 * s, H = 0.48 * s, D = 0.12 * s, lift = 0.14 * s;
      const c = document.createElement('canvas'); c.width = 760; c.height = 384; const g = c.getContext('2d');
      g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, 760, 384);
      g.fillStyle = '#e8e4da'; g.font = '700 46px "VU Print"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOME', 190, 62); g.fillText('AWAY', 570, 62);
      const [h, w] = String(a.score || '0-0').split('-');
      g.shadowColor = '#ff9a1f'; g.shadowBlur = 24; g.fillStyle = '#ffb02e'; g.font = '800 200px "VU Print"'; g.fillText(h, 190, 230); g.fillText(w, 570, 230);
      g.shadowBlur = 0; g.fillStyle = '#2a2a2e'; g.fillRect(378, 100, 4, 250);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const shell = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.4, roughness: 0.5, envMap: ctx.env, envMapIntensity: 0.5 });
      const face = new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.9, roughness: 0.35 });
      const group = new THREE.Group();
      const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [shell, shell, shell, shell, face, shell])); box.position.y = lift + H / 2; group.add(box);
      [-1, 1].forEach((sd) => { const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, lift + 0.05 * s, 0.04 * s), shell)); leg.position.set(sd * W * 0.38, (lift + 0.05 * s) / 2, 0); group.add(leg); const ft = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.025 * s, D * 1.8), shell)); ft.position.set(sd * W * 0.38, 0.0125 * s, 0); group.add(ft); });
      const glow = new THREE.PointLight(0xffa030, 0, 2 * s, 2); glow.position.set(0, lift + H / 2, D / 2 + 0.3 * s); group.add(glow);
      const seen = (v) => (v && v.o != null ? v.o : 1);
      return { group, top: lift + H, anchor: () => new THREE.Vector3(W * 0.38, 0.03 * s, D * 0.9), update(A, B, e) { glow.intensity = 0.8 * lerp(seen(A), seen(B), e); } };
    },
  },
  // An amber pill bottle with a white ridged cap and a printed label ("front"), two capsules spilled beside it.
  pills: {
    build(a, ctx) {
      const s = Math.min(a.w || 120, a.h || 120) * ctx.S, R = 0.16 * s, H = 0.42 * s;
      const amber = new THREE.MeshPhysicalMaterial({ color: 0xa8561a, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.88, envMap: ctx.env, envMapIntensity: 1 });
      const group = new THREE.Group();
      const prof = [[0, 0], [R * 0.95, 0], [R, 0.02 * s], [R, H * 0.9], [R * 0.85, H * 0.95], [R * 0.85, H], [0, H]].map(([x, y]) => new THREE.Vector2(x, y));
      group.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), amber)));
      const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.1 * s, 48), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }))); cap.position.y = H + 0.035 * s; group.add(cap);
      for (let i = 0; i < 40; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008 * s, 0.09 * s, 0.01 * s), cap.material); const an = (i / 40) * Math.PI * 2; rib.position.set(Math.sin(an) * R * 1.05, H + 0.035 * s, Math.cos(an) * R * 1.05); rib.rotation.y = an; group.add(rib); }
      const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 1024, 256); g.fillStyle = '#c4161c'; g.fillRect(0, 0, 1024, 46);
      g.fillStyle = '#1f2a44'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 64px "VU Print"'; g.fillText(String(a.front || 'MIRACLE'), 512, 120); g.font = '500 30px "VU Print"'; g.fillText('60 capsules   Doctor recommended', 512, 196);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.003, R + 0.003, H * 0.5, 48, 1, true, -Math.PI * 0.6, Math.PI * 1.2), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 })); label.position.y = H * 0.45; group.add(label);
      const capsule = (x, z, ry) => { const g2 = new THREE.Group(); [[0xc4161c, 1], [0xf4f1ea, -1]].forEach(([col, sd]) => { const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 * s, 0.05 * s, 6, 12), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1 })); h.scale.set(1, 0.5, 1); h.position.y = sd * 0.024 * s; shadowed(h); g2.add(h); }); g2.rotation.set(0, ry, Math.PI / 2); g2.position.set(x, 0.03 * s, z); group.add(g2); };
      capsule(R * 1.9, R * 0.8, 0.4); capsule(R * 1.5, R * 1.6, -0.9);
      return { group, top: H + 0.09 * s, anchor: () => new THREE.Vector3(-R * 0.6, 0.05 * s, R * 0.8), update() {} };
    },
  },
};
