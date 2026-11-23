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
      m.position.y = r;
      const group = new THREE.Group(); group.add(m);
      return { group, top: 2 * r, radius: r, anchor: () => new THREE.Vector3(0, r * 0.4, r * 0.9), update() {} };
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
};
