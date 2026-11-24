// Void University crystal, the bottle (Bryan, 23 Nov 2026: "A, the bottle"). The Make it set crystal drawn as a real
// thing on the lit table: a glass bottle of supercooled water, the five partials written by hand on paper slips around
// it. crystal.js still runs the growth rules; this only draws what they say:
//   liquid    clear water, tiny clusters that sparkle and melt and never catch
//   the right piece   its slip lies before the bottle and a seed of ice goes in at the top; white ice runs down
//                     through the water, and once it has set a string ties every slip to the bottle
//   a wrong piece     two grains grow from either side, one clear and one cloudy, and the ice cracks where they meet
//   fast cooling      flaws are trapped in the ice as dark specks; heat (annealing) works them out
//   heat on a wrong core   the ice melts back to water and the slips wait to be chosen again
// Modelled in code, nothing downloaded or generated. One renderer for the page; each crystal copies its frame onto
// its own canvas.
import * as THREE from './three.module.min.js';

const HAND = 'VU Hand';
let fontsP = null;
function fonts() {
  if (fontsP) return fontsP;
  try {
    const f = new FontFace(HAND, 'url(' + new URL('fonts/fraunces-latin.woff2', import.meta.url) + ')', { weight: '100 900', style: 'italic' });
    document.fonts.add(f); fontsP = f.load().catch(() => null);
  } catch (e) { fontsP = Promise.resolve(null); }
  return fontsP;
}
let GL;
function gl() {
  if (GL !== undefined) return GL;
  try {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    GL = { r, canvas, env: undefined };
  } catch (e) { GL = null; }
  return GL;
}
function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

// the same dark wood table as the lesson scenes
let WOOD = null;
function wood() {
  if (WOOD) return WOOD;
  const rnd = seeded(11), c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#3a2516'; g.fillRect(0, 0, 2048, 1024);
  const ph = 1024 / 6;
  for (let p = 0; p < 6; p++) {
    const tone = 0.82 + rnd() * 0.3;
    g.fillStyle = 'rgba(' + Math.round(96 * tone) + ',' + Math.round(60 * tone) + ',' + Math.round(34 * tone) + ',0.55)'; g.fillRect(0, p * ph, 2048, ph);
    for (let k = 0; k < 70; k++) {
      const y0 = p * ph + rnd() * ph, amp = 2 + rnd() * 7, f = 0.002 + rnd() * 0.006, q = rnd() * 6;
      g.strokeStyle = 'rgba(' + (rnd() < 0.5 ? '30,16,8' : '140,96,58') + ',' + (0.08 + rnd() * 0.16) + ')'; g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath(); for (let x = 0; x <= 2048; x += 16) { const y = y0 + Math.sin(x * f + q) * amp + Math.sin(x * f * 3.1) * amp * 0.3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
    g.fillStyle = 'rgba(10,5,2,0.75)'; g.fillRect(0, p * ph, 2048, 3); g.fillStyle = 'rgba(170,120,80,0.10)'; g.fillRect(0, p * ph + 3, 2048, 2);
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  return (WOOD = t);
}
// a soft room of warm and cool light for the glass to reflect
function env() {
  if (GL.env !== undefined) return GL.env;
  try {
    const room = new THREE.Scene(); room.background = new THREE.Color(0x1a130d);
    const panel = (w, h, col, k, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); room.add(m); };
    panel(6, 6, 0xffd9a8, 6, [-2, 8, 3]); panel(10, 4, 0x31405a, 3, [0, 3, -9]); panel(30, 30, 0x3a2414, 1, [0, -1, 0.01]);
    GL.env = new THREE.PMREMGenerator(GL.r).fromScene(room, 0.04).texture;
  } catch (e) { GL.env = null; }
  return GL.env;
}
// ice: feathers of needles running down from where it started, over a pale ground; "cloudy" is the misaligned grain
function iceTex(kind) {
  const rnd = seeded(kind === 'cloudy' ? 23 : 5), c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = kind === 'cloudy' ? '#a7a296' : '#b9d3e3'; g.fillRect(0, 0, 512, 1024);
  for (let f = 0; f < 70; f++) {
    let x = rnd() * 512, y = 0; g.strokeStyle = 'rgba(255,255,255,' + (0.35 + rnd() * 0.5) + ')'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, y);
    while (y < 1024) { const nx = x + (rnd() - 0.5) * 22, ny = y + 18 + rnd() * 20; g.lineTo(nx, ny); const sd = rnd() < 0.5 ? 1 : -1; g.lineTo(nx + sd * (8 + rnd() * 16), ny - 10 - rnd() * 10); g.moveTo(nx, ny); x = nx; y = ny; }
    g.stroke();
  }
  for (let i = 0; i < 6000; i++) { const x = rnd() * 512, y = rnd() * 1024, a = rnd() * Math.PI, l = 3 + rnd() * 9; g.strokeStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.6) + ')'; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  for (let i = 0; i < 1200; i++) { g.fillStyle = 'rgba(120,150,175,' + rnd() * 0.25 + ')'; g.fillRect(rnd() * 512, rnd() * 1024, 2 + rnd() * 4, 2 + rnd() * 4); }
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
}
// the growing front: a disc of needles reaching out into the water, seen from below as the ice comes down
function frontTex() {
  const rnd = seeded(31), c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, r0 = rnd() * 200, l = 10 + rnd() * 40;
    g.strokeStyle = 'rgba(240,250,255,' + (0.25 + rnd() * 0.5) + ')'; g.lineWidth = 0.8 + rnd() * 1.4;
    g.beginPath(); g.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0); g.lineTo(256 + Math.cos(a) * (r0 + l), 256 + Math.sin(a) * (r0 + l)); g.stroke();
  }
  return tex(c);
}
// a slip of paper with a partial written on it by hand
function slipFace(text, ink, w, h) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const g = c.getContext('2d');
  const rnd = seeded(text.length * 97 + 3);
  g.fillStyle = '#efe6cf'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(90,70,40,' + rnd() * 0.06 + ')'; g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2); }
  g.fillStyle = 'rgba(120,90,50,0.10)'; g.fillRect(0, c.height - 6, c.width, 6);
  g.fillStyle = ink; g.textBaseline = 'middle';
  // the biggest hand that fits in three lines
  let size = 96, lines;
  for (; size > 40; size -= 4) {
    g.font = 'italic 600 ' + size + 'px "' + HAND + '"';
    lines = ['']; for (const wd of String(text).split(/\s+/)) { const t = (lines[lines.length - 1] + ' ' + wd).trim(); if (g.measureText(t).width > c.width - 80 && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t; }
    if (lines.length <= 3 && lines.length * size * 1.12 < c.height - 30) break;
  }
  lines.forEach((l, i) => g.fillText(l, 40, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.12));
  return tex(c);
}
const INK = { plain: '#2a2a2a', set: '#123a5c', bad: '#8a4f0e' };

function world(partials, aspect) {
  const E = env();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070605); scene.fog = new THREE.Fog(0x070605, 7, 18);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.62 })); top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
  scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x2a1a10, 0.35));
  const key = new THREE.SpotLight(0xffe0b0, 190, 0, 0.72, 0.9, 2); key.position.set(-0.6, 7, 1); key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4; scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 0.55); rim.position.set(-3, 2.5, -5); scene.add(rim);
  const fill = new THREE.PointLight(0xffb070, 3, 9, 2); fill.position.set(4, 1.4, 3); scene.add(fill);

  // the bottle: turned glass, a shoulder and a neck, a blue cap with ridges
  const Hb = 1.5, Rb = 0.34;
  const prof = [[Rb * 0.92, 0], [Rb, 0.05], [Rb, Hb * 0.66], [Rb * 0.9, Hb * 0.74], [Rb * 0.42, Hb * 0.84], [Rb * 0.3, Hb * 0.9], [Rb * 0.3, Hb],
    [Rb * 0.26, Hb], [Rb * 0.26, Hb * 0.9], [Rb * 0.38, Hb * 0.84], [Rb * 0.86, Hb * 0.74], [Rb * 0.95, Hb * 0.66], [Rb * 0.95, 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.16, envMap: E, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
  const bottle = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), glass); bottle.renderOrder = 3; scene.add(bottle);
  // its base, flat glass (a lathe would shade a flat bottom in streaks)
  const base = new THREE.Mesh(new THREE.CircleGeometry(Rb * 0.93, 64), glass); base.rotation.x = -Math.PI / 2; base.position.y = 0.055; scene.add(base);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1f5a9e, roughness: 0.4, envMap: E, envMapIntensity: 0.5 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(Rb * 0.33, Rb * 0.33, 0.12, 40), capMat); cap.position.y = Hb + 0.05; cap.castShadow = true; scene.add(cap);
  for (let k = 0; k < 24; k++) { const rid = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.1, 0.012), capMat); const a = k / 24 * Math.PI * 2; rid.position.set(Math.cos(a) * Rb * 0.335, Hb + 0.05, Math.sin(a) * Rb * 0.335); rid.rotation.y = -a; scene.add(rid); }
  const foot = new THREE.Mesh(new THREE.CircleGeometry(Rb * 1.08, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); foot.rotation.x = -Math.PI / 2; foot.position.y = 0.003; scene.add(foot);

  // the water fills the body up to the shoulder
  const r = Rb * 0.93, y0 = 0.06, yTop = Hb * 0.64, WH = yTop - y0;
  const water = new THREE.MeshPhysicalMaterial({ color: 0xa9cfe6, roughness: 0.05, transparent: true, opacity: 0.22, envMap: E, envMapIntensity: 1.2, depthWrite: false });
  const wat = new THREE.Mesh(new THREE.CylinderGeometry(r, r, WH, 64), water); wat.position.y = y0 + WH / 2; wat.renderOrder = 1; scene.add(wat);
  const surf = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshPhysicalMaterial({ color: 0xcfe6f5, roughness: 0.02, transparent: true, opacity: 0.2, envMap: E, envMapIntensity: 1.6, depthWrite: false })); surf.rotation.x = -Math.PI / 2; surf.position.y = yTop; scene.add(surf);

  // the ice, in two halves so a wrong piece can grow two grains; each half hangs from the top of the water
  const iceMat = (kind) => { const t = iceTex(kind); return new THREE.MeshPhysicalMaterial({ map: t, emissiveMap: t, emissive: kind === 'cloudy' ? 0x6a6660 : 0xbfe2ff, emissiveIntensity: kind === 'cloudy' ? 0.22 : 0.42, roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.95, envMap: E, envMapIntensity: 0.8 }); };
  const half = (mat, start) => { const g = new THREE.CylinderGeometry(r * 1.002, r * 1.002, 1, 64, 1, false, start, Math.PI); g.translate(0, -0.5, 0); const m = new THREE.Mesh(g, mat); m.position.y = yTop; m.castShadow = true; m.renderOrder = 2; scene.add(m); return m; };
  const clear = iceMat('clear'), cloudy = iceMat('cloudy');
  // grain one faces the left and front, grain two the right and back, so the seam runs down the front
  const hA = half(clear, 0), hB = half(clear, Math.PI);
  const frontMat = new THREE.MeshBasicMaterial({ map: frontTex(), transparent: true, depthWrite: false, opacity: 0.9 });
  const front = new THREE.Mesh(new THREE.CircleGeometry(r * 1.25, 48), frontMat); front.rotation.x = -Math.PI / 2; scene.add(front);
  const rnd = seeded(41);
  // the crack, glowing amber down the seam where two grains could not line up
  const cpts = []; for (let i = 0; i <= 16; i++) cpts.push(new THREE.Vector3((rnd() - 0.5) * 0.05, -i / 16, 0));
  const crackGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 80, 0.011, 6);
  const crack = new THREE.Mesh(crackGeo, new THREE.MeshStandardMaterial({ color: 0xf2a93b, emissive: 0xf2a93b, emissiveIntensity: 1.4 })); crack.position.set(0, yTop, r + 0.006); scene.add(crack);
  // flaws trapped by fast cooling
  const specMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7, transparent: true, opacity: 0.85 }), specs = [];
  // they sit just under the face of the ice, on the side you see, where white ice would hide anything deeper
  for (let i = 0; i < 60; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.014 + rnd() * 0.016, 8, 6), specMat); const a = Math.PI / 2 + (rnd() - 0.5) * 2.6; s.position.set(Math.cos(a) * r * 1.004, y0 + 0.03 + rnd() * (WH - 0.06), Math.sin(a) * r * 1.004); s.scale.set(1, 0.8, 0.45); s.lookAt(0, s.position.y, 0); s.renderOrder = 3; scene.add(s); specs.push(s); }
  // sub-critical clusters in the liquid: they glint and melt, never big enough to catch
  const sparkMat = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0x6fbfe8, emissiveIntensity: 0.9, transparent: true, opacity: 0.6 }), sparks = [];
  for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.016 + rnd() * 0.018), sparkMat); const a = rnd() * Math.PI * 2, rr = rnd() * r * 0.7; s.position.set(Math.cos(a) * rr, y0 + 0.15 + rnd() * (WH - 0.25), Math.sin(a) * rr); scene.add(s); sparks.push(s); }
  // the seed: a shard of ice at the top of the water, with its own little light
  const seedM = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe8ff, emissiveIntensity: 1.2 })); seedM.scale.set(0.7, 1.4, 0.7); seedM.position.y = yTop + 0.02; scene.add(seedM);
  const seedLight = new THREE.PointLight(0x9fdcff, 0, 2.5, 2); seedLight.position.set(0, yTop + 0.1, 0.2); scene.add(seedLight);
  // heat: a warm glow under the bottle, as if a warm hand of light holds it
  const heatLight = new THREE.PointLight(0xff8a3a, 0, 2.2, 2); heatLight.position.set(0, 0.25, 0.45); scene.add(heatLight);
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 256; const gg = glowC.getContext('2d'); const gr = gg.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,150,70,0.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 256);
  const glowMat = new THREE.MeshBasicMaterial({ map: tex(glowC), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), glowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.004; scene.add(glow);

  // the slips: three on the left and two on the right on a wide screen, in two rows before the bottle on a narrow one
  const wide = aspect >= 1.7, sw = wide ? 1.45 : 1.12, sh = wide ? 0.5 : 0.46;
  const places = wide ? [[-1.95, -0.6, 0.08], [1.95, -0.35, -0.07], [-2.0, 0.08, -0.05], [2.0, 0.42, 0.06], [-1.85, 0.72, 0.04]]
    : [[-0.64, 0.62, 0.05], [0.64, 0.6, -0.05], [-1.2, 1.16, -0.04], [0, 1.2, 0.03], [1.2, 1.15, -0.05]];
  const slips = partials.slice(0, 5).map((t, i) => {
    const geo = new THREE.PlaneGeometry(sw, sh, 12, 3), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, 0.012 * Math.sin((p.getX(k) / sw + 0.5) * Math.PI));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: slipFace(t, INK.plain, sw, sh), roughness: 0.92, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m); const [x, z, ry] = places[i]; g.position.set(x, 0.006, z); g.rotation.y = ry; scene.add(g);
    return { g, mat, text: t, ink: 'plain', end: new THREE.Vector3(x + (x < -0.1 ? sw * 0.42 : x > 0.1 ? -sw * 0.42 : 0), 0.02, z + (wide ? 0 : -sh * 0.4)) };
  });
  // the piece you picked lies before the bottle, its string tied to the neck
  const pw = wide ? 1.9 : 1.5, phh = 0.48;
  const pickGeo = new THREE.PlaneGeometry(pw, phh, 12, 3); { const p = pickGeo.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, 0.012 * Math.sin((p.getX(k) / pw + 0.5) * Math.PI)); pickGeo.computeVertexNormals(); }
  const pickMat = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide, transparent: true, opacity: 0 });
  const pickM = new THREE.Mesh(pickGeo, pickMat); pickM.rotation.x = -Math.PI / 2; pickM.castShadow = pickM.receiveShadow = true;
  // on a narrow screen it goes in front of the two rows
  const pick = new THREE.Group(); pick.add(pickM); pick.position.set(0, 0.008, wide ? 0.64 : 1.82); scene.add(pick);
  let pickKey = '';
  const strMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb5, roughness: 0.95 });
  const strings = new THREE.Group(); scene.add(strings);
  let strKey = '';
  function setStrings(list) {
    const k = list.map((v) => v.toArray().map((n) => n.toFixed(2)).join()).join('|');
    if (k === strKey) return; strKey = k;
    strings.children.slice().forEach((m) => { strings.remove(m); m.geometry.dispose(); });
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1], mid = a.clone().lerp(b, 0.5); mid.y += 0.12 + a.distanceTo(b) * 0.05;
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 40, 0.007, 6), strMat); m.castShadow = true; strings.add(m);
    }
  }

  // the camera: everything in frame, seen from a little above the table
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 60);
  const hx = wide ? 3.25 : 1.85, look = new THREE.Vector3(0, wide ? 0.62 : 0.4, wide ? 0.15 : 0.85);
  const dist = Math.max(hx / (Math.tan(THREE.MathUtils.degToRad(15)) * aspect) * 1.02, wide ? 4.2 : 4.6);
  const tilt = wide ? 0.42 : 0.72;

  let shown = { a: 0, b: 0, heat: 0, pick: 0 };
  return {
    scene, camera,
    draw(st, t) {
      // the ice eases toward what the rules say, so it runs down the bottle instead of jumping
      const ease = (k, v, rate) => { shown[k] += (v - shown[k]) * rate; if (Math.abs(v - shown[k]) < 0.002) shown[k] = v; return shown[k]; };
      const two = st.wrong;
      const fa = ease('a', two ? Math.min(1, 2 * st.a) : Math.min(1, st.a + st.b), 0.06), fb = ease('b', two ? Math.min(1, 2 * st.b) : Math.min(1, st.a + st.b), 0.06);
      hA.scale.y = Math.max(0.0001, fa * WH); hB.scale.y = Math.max(0.0001, fb * WH);
      hA.visible = fa > 0.003; hB.visible = fb > 0.003;
      hB.material = two ? cloudy : clear;
      const f = Math.max(fa, fb), growing = (st.mode === 'growing' || st.mode === 'heating') && f > 0.01 && f < 0.995;
      front.visible = growing && !two; front.position.y = yTop - f * WH - 0.004; frontMat.opacity = 0.9;
      wat.visible = f < 0.999 || two; surf.visible = f < 0.02;
      // the crack shows once two grains meet, as long as the shorter of them
      const cl = two && st.bnd > 0 ? Math.min(fa, fb) : 0;
      crack.visible = cl > 0.02; crack.scale.y = Math.max(0.001, cl * WH);
      // flaws: only those inside the ice, as many as the rules trapped
      const n = Math.min(specs.length, Math.round(st.inc * (two ? 0.3 : 0.6))), iceBottom = yTop - f * WH;
      specs.forEach((s, i) => { s.visible = i < n && s.position.y >= iceBottom; });
      sparks.forEach((s, i) => { s.visible = st.mode === 'liquid' && Math.sin(t * 0.07 + i * 1.7) > 0.55; s.rotation.y = t * 0.02 + i; });
      seedM.visible = st.mode !== 'liquid' && !two && f > 0.001;
      seedLight.intensity = st.mode === 'growing' && !two ? 2.2 : f > 0.99 && !two ? 0.8 : 0;
      const h = ease('heat', st.mode === 'heating' ? 1 : 0, 0.05);
      heatLight.intensity = 3.5 * h; glowMat.opacity = 0.85 * h;
      // the slips: blue ink once it has set, brown where it broke
      const ink = st.broken ? 'bad' : st.aha ? 'set' : 'plain';
      slips.forEach((s) => { if (s.ink !== ink) { s.ink = ink; s.mat.map.dispose(); s.mat.map = slipFace(s.text, INK[ink], sw, sh); s.mat.needsUpdate = true; } });
      const pk = st.picked ? st.picked.text + (st.picked.ok ? '|ok' : '|no') : '';
      if (pk !== pickKey) { pickKey = pk; if (pk) { if (pickMat.map) pickMat.map.dispose(); pickMat.map = slipFace(st.picked.text, st.picked.ok ? INK.set : INK.bad, pw, phh); pickMat.needsUpdate = true; } }
      const po = ease('pick', st.picked ? 1 : 0, 0.12); pickMat.opacity = po; pick.visible = po > 0.01; pickM.castShadow = po > 0.98; pick.position.y = 0.008 + (1 - po) * 0.4;
      // strings: the picked piece to the neck; once it has set, every slip to the bottle
      const list = [];
      const neck = new THREE.Vector3(0, Hb * 0.86, Rb * 0.36), mid = (i) => { const e = slips[i].end, d = new THREE.Vector2(e.x, e.z).normalize(); return new THREE.Vector3(d.x * Rb * 1.01, yTop * (0.35 + 0.12 * (i % 3)), d.y * Rb * 1.01); };
      if (st.picked && po > 0.9) list.push(new THREE.Vector3(0, 0.02, pick.position.z - phh * 0.4), neck);
      if (st.aha && !st.broken) slips.forEach((s, i) => list.push(s.end, mid(i)));
      setStrings(list);
      // the camera drifts a little, the way it does over the lesson scenes
      const yaw = (st.still ? 0 : Math.sin(t * 0.004) * 0.05) - 0.06;
      camera.position.set(look.x + Math.sin(yaw) * Math.cos(tilt) * dist, look.y + Math.sin(tilt) * dist, look.z + Math.cos(yaw) * Math.cos(tilt) * dist);
      camera.lookAt(look);
      // still moving toward what the rules say: the view keeps drawing every frame until it gets there
      return Math.abs(fa - (two ? Math.min(1, 2 * st.a) : Math.min(1, st.a + st.b))) > 0.003 || Math.abs(fb - (two ? Math.min(1, 2 * st.b) : Math.min(1, st.a + st.b))) > 0.003 || Math.abs(h - (st.mode === 'heating' ? 1 : 0)) > 0.01 || Math.abs(po - (st.picked ? 1 : 0)) > 0.01;
    },
    dispose() { scene.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) [].concat(n.material).forEach((m) => { if (m.map && m.map !== WOOD) m.map.dispose(); m.dispose(); }); }); },
  };
}

// A view for one crystal: draws onto its own canvas. Null when the page cannot draw in 3D.
export async function bottleView(canvas, partials) {
  if (!gl()) return null;
  await fonts();
  let W = null, aspect = 0, frame = 0, last = '', moving = false;
  return {
    draw(st, ctx, w, h, force) {
      if (w < 2 || h < 2) return;
      const a = w / h;
      if (!W || (a >= 1.7) !== (aspect >= 1.7)) { if (W) W.dispose(); W = world(partials, a); }
      aspect = a; frame++;
      // render every frame while it moves, and now and then while it waits, so a page of crystals costs little
      const key = [st.mode, st.a.toFixed(3), st.b.toFixed(3), st.inc, st.bnd > 0, st.aha, st.broken, st.picked && st.picked.text, w, h].join();
      if (!force && key === last && !moving && st.mode !== 'growing' && st.mode !== 'heating' && frame % 4) return;
      last = key;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      GL.r.setPixelRatio(dpr); GL.r.setSize(w, h, false);
      W.camera.aspect = a; W.camera.updateProjectionMatrix();
      moving = W.draw(st, frame);
      GL.r.render(W.scene, W.camera);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.drawImage(GL.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    },
    dispose() { if (W) W.dispose(); W = null; },
  };
}
