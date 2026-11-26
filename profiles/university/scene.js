// Void University scene engine, the lit table (22 Nov 2026; Bryan picked "A, lit table" from three pictures, after
// "alll of the explaination visuals on university ... are rudimentary"). Every unit's existing `scene` block is acted
// out with real things on a wooden table under a lamp, drawn with three.js (vendor, MIT): paper cards and hang tags,
// stickers that slap down, threads with pins, masking tape. When a step renames a piece it turns over, so the analogy
// is on the front and the idea on the back of the same thing. scene-plan.js holds the rules (what each piece becomes,
// when it turns, what stays in frame); this file draws them. The picture is a pure function of (step, progress).
//
// One WebGL renderer serves the whole page: each scene draws into it and copies the frame to its own canvas, so a
// course with many scenes never runs out of 3D contexts. A scene's world is built when it comes near the screen and
// let go when it is far away; its last frame stays on its canvas. With no WebGL the words and steps still work.
import * as THREE from './three.module.min.js';
import { PROPS } from './scene-props.js';

const P = window.VUScenePlan;
const S = 0.01; // scene units (800 x 360) to metres on the table
const wx = (x) => (x - P.W / 2) * S, wz = (y) => (y - P.H / 2) * S;
const INK = { blue: '#1d3d78', gold: '#8a5d0c', pink: '#c0142c', green: '#1c7444', dim: '#5d5a55', fg: '#2a2724' };
const PAPER = { blue: ['#3d6fc4', '#28508f'], gold: ['#e2a537', '#b97d17'], pink: ['#d8243f', '#a3122a'], green: ['#2f9a5c', '#1d7343'], dim: ['#8f8a83', '#6d6862'], fg: ['#d9d2c4', '#b9b1a2'] };
const THREAD = { blue: 0x2c4f8f, gold: 0xb48323, pink: 0xb3122a, green: 0x2a8a52, dim: 0x8d8780, fg: 0x6b6560 };
const BALL = { blue: 0x2f62c0, gold: 0xe0a43a, pink: 0xd42a48, green: 0x2f9a5c, dim: 0x9a958e, fg: 0xd9d2c4 };
const ink = (c) => INK[c] || INK.fg;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PX = 300; // canvas pixels per metre on printed faces
const PRINT = 'VU Print', HAND = 'VU Hand';

// ----- the printing type, loaded from the site's own font files whatever type the page itself uses
let fontsReady = null;
function fonts() {
  if (fontsReady) return fontsReady;
  const add = (family, file, desc) => {
    try { const f = new FontFace(family, 'url(' + new URL('fonts/' + file, import.meta.url) + ')', desc); document.fonts.add(f); return f.load().catch(() => null); }
    catch (e) { return Promise.resolve(null); }
  };
  fontsReady = Promise.all([
    add(PRINT, 'bricolage-grotesque-latin.woff2', { weight: '200 800' }),
    add(HAND, 'fraunces-latin.woff2', { weight: '100 900' }),
    add(HAND, 'fraunces-latin.woff2', { weight: '100 900', style: 'italic' }),
  ]);
  return fontsReady;
}

// ----- one renderer for the page
let GL;
function gl() {
  if (GL !== undefined) return GL;
  try {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    GL = { r, canvas, wood: null, table: null };
  } catch (e) { GL = null; }
  return GL;
}

function noiseFill(g, w, h, base, amt, seed) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  let s = seed || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (amt) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }
  return rnd;
}
// The table: dark planks with their grain, drawn once for the page.
function table() {
  if (GL.table) return GL.table;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const rnd = noiseFill(g, c.width, c.height, '#3a2516', 10, 11);
  const planks = 6, ph = c.height / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 0.82 + rnd() * 0.3;
    g.fillStyle = 'rgba(' + Math.round(96 * tone) + ',' + Math.round(60 * tone) + ',' + Math.round(34 * tone) + ',0.55)';
    g.fillRect(0, p * ph, c.width, ph);
    for (let k = 0; k < 70; k++) {
      const y0 = p * ph + rnd() * ph, amp = 2 + rnd() * 7, f = 0.002 + rnd() * 0.006, ph0 = rnd() * 6;
      g.strokeStyle = 'rgba(' + (rnd() < 0.5 ? '30,16,8' : '140,96,58') + ',' + (0.08 + rnd() * 0.16) + ')';
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      for (let x = 0; x <= c.width; x += 16) { const y = y0 + Math.sin(x * f + ph0) * amp + Math.sin(x * f * 3.1) * amp * 0.3; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(10,5,2,0.75)'; g.fillRect(0, p * ph, c.width, 3);
    g.fillStyle = 'rgba(170,120,80,0.10)'; g.fillRect(0, p * ph + 3, c.width, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  GL.table = { geo: new THREE.PlaneGeometry(16, 10), mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, metalness: 0 }) };
  return GL.table;
}

// ----- printed faces
function fit(g, text, family, weight, size, max) {
  do { g.font = weight + ' ' + size + 'px "' + family + '"'; size -= 2; } while (g.measureText(text).width > max && size > 10);
  return size + 2;
}
function paperShape(g, w, h, kind) {
  g.beginPath();
  if (kind === 'tag') { const cut = h * 0.22; g.moveTo(cut, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(cut, h); g.lineTo(0, h - cut); g.lineTo(0, cut); }
  else { const r = Math.min(w, h) * (kind === 'slip' ? 0.06 : 0.08); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); }
  g.closePath();
}
// One face of a card, tag or slip: card stock, an ink rule, the big word and the small line. The front is printed; the
// back, where a renamed piece shows its new words, is set in a book face.
function paperFace(c, f, kind, back) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  g.save();
  paperShape(g, w, h, kind); g.clip();
  noiseFill(g, w, h, f.color === 'dim' ? (back ? '#dcd8cf' : '#e2ded6') : (back ? '#e9e2d2' : '#f1ebdd'), 0, 17);
  g.globalAlpha = 0.05; g.strokeStyle = '#6b5a40';
  let s = 23; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 1400; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 18 - 9, y + rnd() * 6 - 3); g.stroke(); }
  g.globalAlpha = 1;
  const rule = kind === 'tag' ? h * 0.42 : kind === 'slip' ? h * 0.18 : Math.min(h * 0.16, w * 0.06);
  if (kind === 'slip') { /* a slip carries words only */ }
  else if (!f.label && !f.sub) { g.strokeStyle = ink(f.color); g.lineWidth = Math.max(3, Math.min(w, h) * 0.02); const m = Math.min(w, h) * 0.08; g.strokeRect(m, m, w - 2 * m, h - 2 * m); }
  else { g.fillStyle = ink(f.color); g.fillRect(rule, h * 0.14, Math.max(4, h * 0.035), h * 0.72); }
  const left = kind === 'slip' ? w / 2 : rule + Math.max(4, h * 0.035) + h * 0.12;
  const room = kind === 'slip' ? w - h * 0.5 : w - left - h * 0.1;
  g.textAlign = kind === 'slip' ? 'center' : 'left'; g.textBaseline = 'middle';
  const fam = back ? HAND : PRINT, wt = back ? 600 : 800;
  const scale = kind === 'slip' ? 1 : (f.size || 22) / 22; // a slip is already cut to its type size
  if (f.label) {
    g.fillStyle = back ? '#1f1b17' : ink(f.color);
    const big = Math.round(h * (f.sub ? 0.34 : 0.42) * Math.min(1.25, Math.max(0.7, scale)) * (back ? 0.9 : 1));
    fit(g, f.label, fam, wt, big, room);
    g.fillText(f.label, left, f.sub ? h * 0.4 : h * 0.52);
  }
  if (f.sub) {
    g.fillStyle = back ? '#3b342c' : '#4a443d';
    fit(g, f.sub, back ? HAND : PRINT, back ? 'italic 500' : 500, Math.round(h * 0.18), room);
    g.fillText(f.sub, left, h * 0.72);
  }
  g.restore();
  if (kind === 'tag') {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(h * 0.22, h * 0.5, h * 0.07, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(150,130,100,0.9)'; g.lineWidth = h * 0.035;
    g.beginPath(); g.arc(h * 0.22, h * 0.5, h * 0.105, 0, Math.PI * 2); g.stroke();
  }
}
// A bar: a strip of coloured paper, its words at the near end. Drawn at its longest; the strip shows as much as it is long.
function barFace(c, f) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const col = PAPER[f.color] || PAPER.fg;
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  let s = 41; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalAlpha = 0.07; g.fillStyle = '#000';
  for (let i = 0; i < (w * h) / 300; i++) g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  g.globalAlpha = 1;
  if (f.label) {
    g.fillStyle = f.color === 'fg' ? '#2a2724' : '#fff8ee'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const hh = Math.min(h, f.h0 * PX * S);
    fit(g, f.label, PRINT, 800, Math.round(hh * 0.4), f.w * PX * S - hh * 0.3);
    g.fillText(f.label, hh * 0.25, hh * 0.52);
  }
}
function stickerFace(c, f) {
  const g = c.getContext('2d'), n = c.width, R = n / 2;
  g.clearRect(0, 0, n, n);
  const col = { gold: ['#f2b33a', '#c9861a'], green: ['#2fa865', '#1c7444'], blue: ['#3d6fc4', '#1d3d78'], dim: ['#9b958c', '#6d6862'], fg: ['#e8e1d3', '#bdb4a3'] }[f.color] || ['#e3263f', '#a90f24'];
  const grad = g.createRadialGradient(R * 0.8, R * 0.7, R * 0.1, R, R, R);
  grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
  const fg = f.color === 'fg' ? '#2a2724' : '#fff';
  g.strokeStyle = fg; g.globalAlpha = 0.85; g.lineWidth = n * 0.012;
  g.beginPath(); g.arc(R, R, R * 0.74, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = String(f.label || '').split(' ');
  const lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : words;
  lines.forEach((t, i) => { fit(g, t, PRINT, 800, Math.round(n * (lines.length > 1 ? 0.22 : 0.2)), n * 0.6); g.fillText(t, R, R + (i - (lines.length - 1) / 2) * n * 0.22); });
}
function pencilFace(c, f) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  if (!f.label) return;
  g.fillStyle = 'rgba(225,215,195,0.8)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, f.label, HAND, 'italic 500', Math.round(h * 0.3), w * 0.8);
  g.fillText(f.label, w / 2, h / 2);
}

function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { c, t };
}
const capPx = (w, h) => { const k = Math.min(1, 1400 / Math.max(w, h)); return [w * k, h * k]; };

// ----- the things on the table. Each has a group, paint(face, words) and fade(opacity).
function paper(a, kind, w, h) {
  const group = new THREE.Group();
  const [cw, ch] = capPx(w * PX, h * PX);
  const faces = [0, 1].map((k) => {
    const { c, t } = canvasTex(cw, ch);
    const geo = new THREE.PlaneGeometry(w, h, kind === 'slip' ? 12 : 28, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w, v = p.getY(i) / h; p.setZ(i, (kind === 'slip' ? 0.008 : 0.018) * u * u * 4 + 0.008 * v * v * 4); }
    geo.computeVertexNormals(); geo.rotateX(-Math.PI / 2);
    if (k === 1) geo.rotateZ(Math.PI);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.86, transparent: true, alphaTest: 0.02 });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.y = k === 0 ? 0.002 : -0.002; group.add(mesh);
    return { c, t, mat, key: null };
  });
  const mats = faces.map((f) => f.mat);
  if (kind === 'tag') {
    const hx = -w / 2 + h * 0.22;
    const pts = [[hx, 0.01, 0], [hx - 0.05, 0.012, -0.03], [hx - 0.12, 0.008, -0.02], [hx - 0.16, 0.006, 0.04], [hx - 0.13, 0.005, 0.09]].map((q) => new THREE.Vector3(q[0], q[1], q[2]));
    const str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 6), new THREE.MeshStandardMaterial({ color: 0xd8cdb5, roughness: 0.95, transparent: true }));
    str.castShadow = true; group.add(str); mats.push(str.material);
  }
  return {
    group, w, h,
    paint(k, f) { const key = JSON.stringify(f); if (faces[k].key === key) return; faces[k].key = key; paperFace(faces[k].c, f, kind, k === 1); faces[k].t.needsUpdate = true; },
    fade(o) { mats.forEach((m) => { m.opacity = o; }); },
  };
}
function bar(a, st) {
  const all = [a].concat(st.map((s) => s.to[a.id]));
  const W = Math.max(...all.map((v) => v.w || 0)) * S, H = Math.max(...all.map((v) => v.h || 0)) * S;
  const group = new THREE.Group();
  const [cw, ch] = capPx(W * PX, H * PX);
  const { c, t } = canvasTex(cw, ch);
  const geo = new THREE.BoxGeometry(1, 0.006, 1);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true });
  const side = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9, transparent: true });
  const mesh = new THREE.Mesh(geo, [side, side, mat, side, side, side]); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.y = 0.004; group.add(mesh);
  let key = null;
  return {
    group, w: W, h: H, bar: true, mesh,
    size(w, h) {
      mesh.scale.set(Math.max(0.001, w * S), 1, Math.max(0.001, h * S));
      t.repeat.set(w * S / W, h * S / H); t.offset.set(0, 1 - h * S / H);
    },
    paint(k, f) { const kk = JSON.stringify(f); if (kk === key) return; key = kk; barFace(c, Object.assign({ h0: a.h || 60 }, f)); t.needsUpdate = true; },
    fade(o) { mat.opacity = o; side.opacity = o; },
  };
}
function sticker(a) {
  const r = (a.w || 70) * S / 2, spikes = 28;
  const shape = new THREE.Shape();
  for (let i = 0; i <= spikes * 2; i++) { const t = (i / (spikes * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.93 : r; const x = Math.cos(t) * rr, y = Math.sin(t) * rr; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
  const group = new THREE.Group();
  const px = Math.min(768, Math.max(256, Math.round(2 * r * PX * 1.6)));
  const faces = [0, 1].map((k) => {
    const { c, t } = canvasTex(px, px);
    t.repeat.set(1 / (2 * r), 1 / (2 * r)); t.offset.set(0.5, 0.5);
    const geo = new THREE.ShapeGeometry(shape, 6); geo.rotateX(-Math.PI / 2);
    if (k === 1) geo.rotateZ(Math.PI);
    const mat = new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18, transparent: true });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.y = k === 0 ? 0.004 : -0.004; group.add(mesh);
    return { c, t, mat, key: null };
  });
  return {
    group, w: 2 * r, h: 2 * r, round: true,
    paint(k, f) { const key = JSON.stringify(f); if (faces[k].key === key) return; faces[k].key = key; stickerFace(faces[k].c, f); faces[k].t.needsUpdate = true; },
    fade(o) { faces.forEach((f) => { f.mat.opacity = o; }); },
  };
}
function ball(a) {
  const r = (a.w || 40) * S / 2;
  const mat = new THREE.MeshPhysicalMaterial({ color: BALL[a.color] || BALL.gold, roughness: 0.38, clearcoat: 0.6, transparent: true });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat); mesh.castShadow = true; mesh.position.y = r;
  const group = new THREE.Group(); group.add(mesh);
  return { group, w: 2 * r, h: 2 * r, round: true, paint(k, f) { mat.color.set(BALL[f.color] || BALL.gold); }, fade(o) { mat.opacity = o; } };
}
function tape(a) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8c79c, roughness: 0.95, transparent: true, opacity: 0.92 });
  const w = (a.w || 100) * S, h = (a.h || 60) * S, t = 0.05;
  [[0, -h / 2, w + 0.04, t], [0, h / 2, w + 0.04, t], [-w / 2, 0, t, h], [w / 2, 0, t, h]].forEach(([x, z, sw, sh]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.002, sh), mat); m.position.set(x, 0.001, z); m.receiveShadow = true; group.add(m);
  });
  const { c, t: tex } = canvasTex(...capPx(w * PX, h * PX));
  const words = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), words); plane.rotation.x = -Math.PI / 2; plane.position.y = 0.002; group.add(plane);
  let key = null;
  return {
    group, w, h,
    paint(k, f) { const kk = f.label || ''; if (kk === key) return; key = kk; pencilFace(c, f); tex.needsUpdate = true; },
    fade(o) { mat.opacity = 0.92 * o; words.opacity = o; },
  };
}
function thread(a) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: THREAD[a.color] || THREAD.dim, roughness: 0.9, transparent: true });
  const pin = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xb08a3e, metalness: 1, roughness: 0.28 }));
  head.position.y = 0.075; head.castShadow = true; pin.add(head);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.3 }));
  needle.position.y = 0.035; pin.add(needle);
  group.add(pin);
  let mesh = null, key = '';
  return {
    group, mat, thread: true,
    shape(v) {
      const k = [v.x, v.y, v.x2, v.y2].map((n) => Math.round(n)).join();
      if (k === key) return; key = k;
      if (mesh) { group.remove(mesh); mesh.geometry.dispose(); }
      const A = new THREE.Vector3(wx(v.x), 0.04, wz(v.y)), B = new THREE.Vector3(wx(v.x2), 0.04, wz(v.y2));
      const d = B.clone().sub(A), n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(Math.min(0.25, d.length() * 0.08));
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t, i) => A.clone().lerp(B, t).add(n.clone().multiplyScalar(Math.sin(t * Math.PI) * (i % 2 ? 1 : 0.6))));
      mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.013, 8), mat);
      mesh.castShadow = true; group.add(mesh);
      pin.position.copy(B);
    },
    lay(draw, o) {
      if (mesh) mesh.geometry.setDrawRange(0, Math.floor(120 * Math.max(0, Math.min(1, draw))) * 8 * 6);
      mat.opacity = o; pin.visible = draw > 0.96 && o > 0.5; group.visible = o > 0.01 && draw > 0.001;
    },
  };
}

// ----- real objects (scene-props.js), each with a paper tag tied on by a string
// A soft room of warm and cool light, blurred once for the page, so brass and gloss have something to reflect.
let ENV;
function envMap() {
  if (ENV !== undefined) return ENV;
  try {
    const room = new THREE.Scene(); room.background = new THREE.Color(0x1a130d);
    const panel = (w, h, col, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); room.add(m); };
    panel(6, 6, 0xffd9a8, 6, [-2, 8, 3]); panel(10, 4, 0x31405a, 3, [0, 3, -9]); panel(30, 30, 0x3a2414, 1, [0, -1, 0.01]);
    ENV = new THREE.PMREMGenerator(GL.r).fromScene(room, 0.04).texture;
  } catch (e) { ENV = null; }
  return ENV;
}
function object(a, kind) {
  const tw = (a.tagW || 170) * S, th = (a.tagH || 85) * S;
  const tag = paper(a, 'tag', tw, th);
  const lib = kind === 'prop' ? PROPS[a.prop] : null;
  const thing = lib ? lib.build(a, { S, env: envMap() }) : null;
  const group = new THREE.Group(), mats = [];
  // each material keeps its own see-through (glass stays glass); fading multiplies it
  if (thing) thing.group.traverse((n) => { if (n.material) [].concat(n.material).forEach((m) => mats.push({ m, t: m.transparent, o: m.opacity })); });
  const strMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb5, roughness: 0.95, transparent: true });
  let str = null, key = '';
  return {
    kind, tag, thing, group, w: tw, h: th, hole: new THREE.Vector3(-tw / 2 + th * 0.22, 0.02, 0),
    paint: (k, f) => tag.paint(k, f),
    fade(o) {
      tag.fade(o); strMat.opacity = o;
      mats.forEach((b) => { const t = b.t || o < 0.999; if (b.m.transparent !== t) { b.m.transparent = t; b.m.needsUpdate = true; } b.m.opacity = b.o * o; });
    },
    // the string from the tag's hole to where it ties on, both in world space, hanging a little slack
    tie(from, to) {
      const k = [from.x, from.y, from.z, to.x, to.y, to.z].map((n) => n.toFixed(3)).join();
      if (k === key) return; key = k;
      if (str) { group.remove(str); str.geometry.dispose(); }
      const mid = from.clone().lerp(to, 0.5); mid.y += Math.min(0.2, from.distanceTo(to) * 0.1);
      const q = from.clone().lerp(mid, 0.5); q.y = mid.y * 0.7 + from.y * 0.3;
      str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, q, mid, to]), 48, 0.008, 6), strMat);
      str.castShadow = true; group.add(str);
    },
  };
}

// ----- a scene's world: its table, its lamp, its things and its camera
function world(sc, plan) {
  const st = plan.states;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070605);
  scene.fog = new THREE.Fog(0x070605, 7, 18);
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 60);
  const tb = table();
  const top = new THREE.Mesh(tb.geo, tb.mat); top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
  scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x2a1a10, 0.35));
  const key = new THREE.SpotLight(0xffe0b0, 190, 0, 0.72, 0.9, 2);
  key.castShadow = true; key.shadow.mapSize.set(1536, 1536); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 0.55); rim.position.set(-3, 2.5, -5); scene.add(rim);
  const fill = new THREE.PointLight(0xffb070, 3, 9, 2); fill.position.set(4, 1.4, 3); scene.add(fill);

  const objs = {};
  sc.actors.forEach((a) => {
    const k = plan.kind[a.id];
    let o;
    if (k === 'thread') o = thread(a);
    else if (k === 'sticker') o = sticker(a);
    else if (k === 'ball') o = ball(a);
    else if (k === 'tape') o = tape(a);
    else if (k === 'bar') o = bar(a, st);
    else if (k === 'prop' || k === 'label') { o = object(a, k); scene.add(o.tag.group); if (o.thing) scene.add(o.thing.group); }
    else if (k === 'slip') {
      // sized by its longest words, so a slip never shrinks its words when they change
      const longest = st.map((s) => s.to[a.id]).reduce((m, v) => (String(v.label || '').length > String(m.label || '').length ? v : m), a);
      const z = P.slipSize(longest); o = paper(a, 'slip', z.w * S, z.h * S);
    }
    else o = paper(a, k, (a.w || 200) * S, (a.h || 100) * S);
    // later pieces lie on top of earlier ones, as they were painted in the flat scenes
    o.kind = k; o.stack = sc.actors.indexOf(a) * 0.006; scene.add(o.group); objs[a.id] = o;
  });
  // A scene with real objects is seen from lower down, the way you look at things standing on a table.
  // (objects that only lie flat, like paper, are still best seen from above)
  const tall = Math.max(0, ...Object.values(objs).filter((o) => o.thing).map((o) => o.thing.top || 0));
  const standing = sc.actors.some((a) => plan.kind[a.id] === 'prop') && tall > 0.15;
  // Where the camera stands at the end of step i: everything on the table in frame, leaning a little toward the step.
  function pose(i) {
    const f = plan.frame(i), b = f.box, fo = f.focus;
    const c = new THREE.Vector3(wx((b[0] + b[2]) / 2), 0, wz((b[1] + b[3]) / 2)), fc = new THREE.Vector3(wx((fo[0] + fo[2]) / 2), 0, wz((fo[1] + fo[3]) / 2));
    const tgt = c.clone().lerp(fc, 0.2);
    const hx = Math.max(wx(b[2]) - tgt.x, tgt.x - wx(b[0])), hz = Math.max(wz(b[3]) - tgt.z, tgt.z - wz(b[1]));
    const span = Math.max((2 * hx) / camera.aspect * 1.12, 2 * hz * (standing ? 1 : 1.35), 1.7) + (standing ? 0.5 + tall * 0.4 : 0.4);
    if (standing) tgt.y = Math.min(0.8, 0.2 + tall * 0.3);
    return { tgt, dist: span / (2 * Math.tan((camera.fov * Math.PI) / 360)), light: c.clone().lerp(fc, 0.45) };
  }
  const v3 = (A, B, k, e) => { const a = A[k] == null ? B[k] : A[k], b = B[k] == null ? a : B[k]; return a == null ? 0 : lerp(a, b, e); };

  function draw(beat, prog) {
    const s = st[beat], e = ease(prog);
    for (const id in objs) {
      const o = objs[id], A = s.from[id], B = s.to[id];
      const v = {};
      ['x', 'y', 'w', 'h', 'o', 's', 'x2', 'y2', 'draw'].forEach((k) => { v[k] = v3(A, B, k, e); });
      if (o.thread) { o.shape(v); o.lay(v.draw, v.o); o.mat.color.set(THREAD[e < 0.5 ? A.color : B.color] || THREAD.dim); continue; }
      if (o.kind === 'prop' || o.kind === 'label') { place(id, o, A, B, v, beat, prog, e, s); continue; }
      const fp = plan.faces[id][beat];
      const fA = { label: A.label, sub: A.sub, color: A.color, size: A.size }, fB = { label: B.label, sub: B.sub, color: B.color, size: B.size };
      if (o.bar) { fA.w = A.w; fB.w = B.w; }
      if (fp.turned) { o.paint(fp.from, fA); o.paint(fp.face, fB); } else o.paint(fp.face, e < 0.5 ? fA : fB);
      if (o.bar) o.size(v.w, v.h);
      let cx, cz;
      if (o.kind === 'slip') { cx = wx(v.x); cz = wz(v.y); }
      else if (o.round) { cx = wx(v.x + (v.w || 70) / 2); cz = wz(v.y + (v.w || 70) / 2); }
      else { cx = wx(v.x + (v.w || 0) / 2); cz = wz(v.y + (v.h || 0) / 2); }
      // A piece coming onto the table drops into place; one leaving lifts away. A piece that stays but is dimmed
      // (o between 0 and 1 in the data) lies where it is, faded.
      const arriving = A.o < 0.05 && B.o >= 0.05, leaving = A.o >= 0.05 && B.o < 0.05;
      const drop = arriving ? (1 - e) * 0.9 : leaving ? e * 0.5 : 0;
      let turn = fp.face === 1 ? Math.PI : 0, lift = 0;
      if (fp.turned) { const t = ease(Math.min(1, prog * 1.25)); turn = (fp.from === 1 ? Math.PI : 0) + Math.PI * t * (fp.face === 1 ? 1 : -1); lift = Math.sin(Math.PI * t) * Math.min(0.6, Math.max(o.w, o.h) * 0.45); }
      const wob = B.shake ? Math.sin(prog * Math.PI * 9) * 0.09 * (1 - prog) : 0;
      const slap = o.round && o.kind === 'sticker' && arriving && prog > 0.5 ? 1 + Math.sin(Math.min(1, prog * 1.4) * Math.PI) * 0.12 : 1;
      o.group.position.set(cx, o.stack + drop + lift, cz);
      o.group.rotation.set(0, (id.charCodeAt(0) % 5 - 2) * 0.025 + wob, turn);
      o.group.scale.setScalar(Math.max(0.01, v.s) * slap);
      o.fade(Math.max(0, Math.min(1, v.o)));
      o.group.visible = v.o > 0.01 && !(o.kind === 'slip' && !A.label && !B.label);
    }
    // strings last, once every object stands where it is this frame
    for (const id in objs) {
      const o = objs[id];
      if (o.kind !== 'prop' && o.kind !== 'label') continue;
      let to = null, shown = o.tag.group.visible;
      if (o.kind === 'prop' && o.thing) { o.thing.group.updateMatrixWorld(); to = o.thing.group.localToWorld(o.thing.anchor('tie')); shown = shown && o.thing.group.visible; }
      if (o.kind === 'label') {
        const tie = String(sc.actors.find((a) => a.id === id).tie).split('.'), t = objs[tie[0]];
        if (t && t.thing) { t.thing.group.updateMatrixWorld(); to = t.thing.group.localToWorld(t.thing.anchor(tie[1] || 'tie')); shown = shown && t.thing.group.visible; }
      }
      o.group.visible = !!to && shown;
      if (!o.group.visible) continue;
      o.tag.group.updateMatrixWorld();
      o.tie(o.tag.group.localToWorld(o.hole.clone()), to);
    }
    const Pp = pose(Math.max(0, beat - 1)), Q = pose(beat), first = beat === 0;
    const tgt = first ? Q.tgt : Pp.tgt.clone().lerp(Q.tgt, e), dist = first ? Q.dist : lerp(Pp.dist, Q.dist, e);
    const lt = first ? Q.light : Pp.light.clone().lerp(Q.light, e);
    const tilt = standing ? 0.6 : 0.95, yaw = -0.16 + (beat + e) * 0.012;
    camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(tilt) * dist, tgt.y + Math.sin(tilt) * dist, tgt.z + Math.cos(yaw) * Math.cos(tilt) * dist);
    camera.lookAt(tgt);
    key.position.set(lt.x - 0.6, 7, lt.z + 1); key.target.position.copy(lt);
  }
  // An object and its tag. The object stands in its piece's box, or rests "on" another object; the tag lies where the
  // data puts it and turns over like any card.
  function place(id, o, A, B, v, beat, prog, e, s) {
    const fp = plan.faces[id][beat];
    const fA = { label: A.label, sub: A.sub, color: A.color, size: A.size }, fB = { label: B.label, sub: B.sub, color: B.color, size: B.size };
    if (fp.turned) { o.paint(fp.from, fA); o.paint(fp.face, fB); } else o.paint(fp.face, e < 0.5 ? fA : fB);
    const arriving = A.o < 0.05 && B.o >= 0.05, leaving = A.o >= 0.05 && B.o < 0.05;
    const drop = arriving ? (1 - e) * 0.9 : leaving ? e * 0.5 : 0, seen = v.o > 0.01;
    const wob = B.shake ? Math.sin(prog * Math.PI * 9) * 0.09 * (1 - prog) : 0;
    if (o.thing) {
      const at = (St, all) => {
        const base = St.on && objs[St.on] && objs[St.on].thing;
        if (base) {
          // it stands where its own box says, at the height of the top of what it rests on
          const r = o.thing.radius || 0, cup = base.cup || 0;
          return new THREE.Vector3(wx(St.x + (St.w || 100) / 2), base.top - (r && cup ? r - Math.sqrt(Math.max(0, r * r - cup * cup)) : 0), wz(St.y + (St.h || 100) / 2));
        }
        return new THREE.Vector3(wx(St.x + (St.w || 100) / 2), 0, wz(St.y + (St.h || 100) / 2));
      };
      const pA = at(A, s.from), pB = at(B, s.to), p = pA.clone().lerp(pB, e);
      if ((A.on || null) !== (B.on || null)) p.y += Math.sin(Math.PI * e) * 0.25;
      // a wheel or a ball rolls in along the table instead of dropping onto it, and turns as it goes
      const rolls = o.thing.rollsIn && arriving;
      if (rolls) p.x -= (1 - e) * 2.5;
      o.thing.group.position.set(p.x, p.y + (rolls ? 0 : drop), p.z);
      o.thing.group.rotation.set(0, wob, 0);
      const r = o.thing.radius, sp = o.thing.spin;
      if (sp && r) sp.rotation.set((p.z - pA.z) / r, 0, -(p.x - (rolls ? pA.x - 2.5 : pA.x)) / r);
      o.thing.update(A, B, e);
      o.thing.group.visible = seen;
    }
    let tx, tz;
    if (o.kind === 'label') { tx = wx(v.x); tz = wz(v.y); }
    else { const off = B.tag || A.tag || [0, (v.h || 100) / 2 + 60]; tx = wx(v.x + (v.w || 100) / 2 + off[0]); tz = wz(v.y + (v.h || 100) / 2 + off[1]); }
    let turn = fp.face === 1 ? Math.PI : 0, lift = 0;
    if (fp.turned) { const t = ease(Math.min(1, prog * 1.25)); turn = (fp.from === 1 ? Math.PI : 0) + Math.PI * t * (fp.face === 1 ? 1 : -1); lift = Math.sin(Math.PI * t) * Math.min(0.6, Math.max(o.w, o.h) * 0.45); }
    o.tag.group.position.set(tx, o.stack + drop + lift, tz);
    o.tag.group.rotation.set(0, (id.charCodeAt(0) % 5 - 2) * 0.05 + wob, turn);
    o.tag.group.scale.setScalar(Math.max(0.01, v.s));
    o.fade(Math.max(0, Math.min(1, v.o)));
    // a tag whose words go blank goes with them, halfway through the step
    const said = (v) => !!(v.label || v.sub);
    o.tag.group.visible = seen && (fp.turned ? said(A) || said(B) : e < 0.5 ? said(A) : said(B));
  }
  function dispose() {
    scene.traverse((n) => {
      if (n.isMesh && n.geometry !== tb.geo) n.geometry.dispose();
      const ms = n.material ? [].concat(n.material) : [];
      ms.forEach((m) => { if (m === tb.mat) return; if (m.map) m.map.dispose(); m.dispose(); });
    });
    key.shadow.map && key.shadow.map.dispose();
  }
  return { scene, camera, objs, draw, dispose };
}

function mount(root) {
  const sc = JSON.parse(root.dataset.scene);
  const plan = P.plan(sc), st = plan.states;
  const stage = root.querySelector('.sc-stage');
  const view = document.createElement('canvas');
  view.setAttribute('role', 'img'); view.setAttribute('aria-label', sc.analogy || 'scene');
  stage.appendChild(view);
  const say = root.querySelector('.sc-say'), dots = root.querySelector('.sc-dots'), playBtn = root.querySelector('.sc-play');
  sc.beats.forEach((_, i) => {
    const d = document.createElement('button');
    d.type = 'button'; d.setAttribute('aria-label', 'Step ' + (i + 1));
    d.onclick = () => { stop(); go(i, 1); };
    dots.appendChild(d);
  });
  if (!gl()) root.classList.add('no3d');

  let W = null, near = false, building = null;
  async function build() {
    if (W || building || !GL) return building;
    building = fonts().then(() => {
      // a scene that cannot be built shows its words and steps, and never stops the others
      if (near && !W) { try { W = world(sc, plan); } catch (e) { console.error(e); root.classList.add('no3d'); } }
      building = null; paint();
    });
    return building;
  }
  function paint() {
    if (!W || !GL) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(r.width * dpr), ph = Math.round(r.height * dpr);
    if (view.width !== pw || view.height !== ph) { view.width = pw; view.height = ph; }
    GL.r.setPixelRatio(dpr); GL.r.setSize(r.width, r.height, false);
    W.camera.aspect = r.width / r.height; W.camera.updateProjectionMatrix();
    W.draw(beat, prog);
    GL.r.render(W.scene, W.camera);
    view.getContext('2d').drawImage(GL.canvas, 0, 0, pw, ph);
  }

  const backBtn = root.querySelector('.sc-back'), nextBtn = root.querySelector('.sc-next');
  let beat = 0, prog = 0, playing = false, last = 0, raf = 0, hold = 0;
  function go(i, p) {
    beat = Math.max(0, Math.min(st.length - 1, i)); prog = Math.max(0, Math.min(1, p));
    say.textContent = sc.beats[beat].say || '';
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= beat));
    root.classList.toggle('done', beat === st.length - 1 && prog >= 1);
    // nowhere further to step: the button says so (the Voidverse function test's F21)
    nextBtn.disabled = beat === st.length - 1 && prog >= 1; backBtn.disabled = beat === 0 && prog <= 0;
    paint();
  }
  function tick(t) {
    if (!playing) return;
    const dt = last ? (t - last) / 1000 : 0; last = t;
    const dur = sc.beats[beat].dur || 2.4;
    if (still()) { hold += dt; if (prog < 1) go(beat, 1); if (hold >= dur) { hold = 0; if (beat < st.length - 1) go(beat + 1, 1); else { stop(); return; } } }
    else {
      prog += dt / dur;
      if (prog >= 1) { if (beat < st.length - 1) { beat += 1; prog = 0; } else { go(beat, 1); stop(); return; } }
      go(beat, prog);
    }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (beat === st.length - 1 && prog >= 1) go(0, 0);
    playing = true; last = 0; hold = 0; playBtn.textContent = 'Pause'; raf = requestAnimationFrame(tick);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); playBtn.textContent = beat === st.length - 1 && prog >= 1 ? 'Watch again' : 'Play'; }
  playBtn.onclick = () => (playing ? stop() : play());
  backBtn.onclick = () => { stop(); if (beat > 0) go(beat - 1, 1); else go(0, 0); };
  nextBtn.onclick = () => { stop(); if (prog < 1) go(beat, 1); else go(beat + 1, 1); };
  go(0, 0);
  root._sc = { go, beats: st.length, plan, state: () => ({ beat, prog, built: !!W }), ready: () => { near = true; return W ? Promise.resolve() : build(); } };

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => paint()).observe(stage);
  if (typeof IntersectionObserver === 'function') {
    // Built when it comes near the screen; let go when it is far off and still (its last frame stays on its canvas).
    new IntersectionObserver((es) => {
      near = es[es.length - 1].isIntersecting;
      if (near) build();
      else if (W && !playing) { W.dispose(); W = null; }
    }, { rootMargin: '900px 0px' }).observe(root);
    // Starts by itself the first time it is well in view; after that the viewer drives it.
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.6 });
    io.observe(root);
  } else { near = true; build(); }
}

// One scene that cannot start never stops the others on the page.
document.querySelectorAll('.sc[data-scene]').forEach((root) => { try { mount(root); } catch (e) { root.classList.add('no3d'); console.error(e); } });
