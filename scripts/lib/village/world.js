// VOID VILLAGE world data (PLAN-void-village T4, T6): places are blocks, and blocks are data. Each block is
// [x, y, z, kind]: x and z run along the ground, y is height (up). A kind names a color now and, later, what the
// block is and does (a sink fills, a seed grows). Look: "Blocks, bold" (B, 15 Nov 2026), the kids colors.
// Nothing here is copied from any game; every place is drawn new for Void Village.

const COLORS = {
  beet: '#a3123f', hwall: '#eaf4ff', hwall2: '#dcebfb', lwall3: '#fff0f6', lwall4: '#fbe3ee',
  bkfloor: '#f6e2c8', bkfloor2: '#efd5b4', bkwall: '#fff3e6', bkwall2: '#fbe8d4',
  clfloor: '#e3f5ee', clfloor2: '#d3eee4', clwall: '#f4fbf8', clwall2: '#e9f6f1',
  scfloor: '#d6ecfa', scfloor2: '#c6e2f5', scwall: '#fff6dc', scwall2: '#fdeecb',
  grass: '#8fdc8a', grass2: '#7fd07c', road: '#c9c4b6', line: '#ffd23f', walk: '#efe4c4', soil: '#a0602a', sprout: '#4cbf6b',
  cream: '#fff1cc', white: '#ffffff', wood: '#c98a4b', darkwood: '#8a5a2b', pink: '#ff5fa2', teal: '#2ec4b6', sky: '#4cc9f0',
  sun: '#ffd23f', leaf: '#4cbf6b', leaf2: '#3fae5e', water: '#4cc9f0', stone: '#b9bccb', ink: '#1b1f3b', floor: '#e8c48a',
  floor2: '#dcb478', wall: '#fff6dc', wall2: '#fdeecb', base: '#e6d3a8', mattress: '#ffffff', glass: '#bfeefe', teal2: '#26ad9f', blanket: '#ff5fa2', cream2: '#f7e4b2', white2: '#eef1f6', pink2: '#e84d90', leaf3: '#6fd47a', stone2: '#a3a7ba', orange: '#ff9f1c', tile: '#ffffff', tile2: '#cdeff6', kwall: '#e9fbf7', kwall2: '#dcf5ef', stripe: '#2ec4b6', cabinet: '#fff1cc', counter: '#f4f4f0', skin: '#d9a07a', sleeve: '#4cc9f0', bubble: '#ffffff', mirror: '#d8f3fb', hair: '#5a3825', cheese: '#ffd23f', cheese2: '#e8b90f', egg: '#fff3dc', honey: '#f5a623', bread: '#f2c98a', crust: '#b8792f', apple: '#ff4f6d', butter: '#fff0a8', soil2: '#8a5226', hole: '#5a3418', bean: '#f6e6c8', weed: '#3b8f4a', peg: '#e9c79a', money: '#7fc97f', firered: '#e8443a', libwall: '#f2efe6', ptile: '#eef6fb', ctile: '#fbe9c8', ctile2: '#f4dcae', cwall: '#e8f7f1', cwall2: '#dcf1e8', plaza: '#e6dfcf', plaza2: '#d8d0bd', ptile2: '#e1eef6', pwall: '#e8f4fb', pwall2: '#dbedf7', path2: '#e9dcc0', roofteal: '#26ad9f', ltile: '#e7d3b0', ltile2: '#dcc39b', lwall: '#fdf1dc', lwall2: '#f7e6c6', brick: '#d9574a', brick2: '#b8463b', roofred: '#c0392b', smoke: '#9aa0b4', ftile: '#e9edf2', ftile2: '#dde3ea', fwall: '#fbe3df', fwall2: '#f6d6d0', money2: '#3f8f4f', mtile: '#fff6dc', mtile2: '#ffe7b3', mwall: '#e5f7f2', mwall2: '#d6f0ea', planks: '#d9a466', planks2: '#c98f52', swall: '#f3dcb4', swall2: '#ead0a3', bag: '#e8f6fb', tile3: '#e6f6fb', btile: '#bfeaf5', bwall: '#fff6dc', bwall2: '#fdeecb', pillow: '#ffffff', rug: '#2ec4b6', book1: '#ff5fa2', book2: '#4cc9f0', book3: '#ffd23f', skin2: '#c98d66', orange2: '#e8870f', skin3: '#e8b796', bag2: '#9fd8c8', sky2: '#a8dff5', ink2b: '#3a3f66', mouth: '#b8324f', toothline: '#cfd3dc',
};

function box(b, x0, y0, z0, w, h, d, kind) { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) b.push([x, y, z, kind]); }
function set(b, x, y, z, kind) { const k = b.find((q) => q[0] === x && q[1] === y && q[2] === z); if (k) k[3] = kind; else b.push([x, y, z, kind]); }
function hollowHouse(b, x0, z0, w, d, h, wall, roof) {
  for (let y = 1; y <= h; y++) for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) if (x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1) b.push([x, y, z, wall]);
  // a stepped roof: each layer one block smaller, like a pitched roof made of bricks
  for (let k = 0; k < Math.ceil(d / 2) + 1; k++) { const zz0 = z0 - 1 + k, zz1 = z0 + d - k; if (zz1 < zz0) break; for (let x = x0 - 1; x <= x0 + w; x++) for (let z = zz0; z <= zz1; z++) if (z === zz0 || z === zz1 || zz1 - zz0 <= 1) b.push([x, h + 1 + k, z, roof]); }
}

function oldStreet() { // the first chunky test (kept for comparison, not shown)
  const b = [];
  for (let x = 0; x < 26; x++) for (let z = 0; z < 18; z++) b.push([x, 0, z, z === 9 || z === 10 ? 'road' : z === 8 || z === 11 ? 'walk' : (x + z) % 2 ? 'grass' : 'grass2']);
  for (let x = 1; x < 26; x += 3) b.push([x, 0, 9, 'line']), b.push([x + 1, 0, 9, 'line']);
  // your house
  hollowHouse(b, 2, 2, 6, 5, 3, 'cream', 'pink');
  set(b, 4, 1, 6, 'darkwood'); set(b, 4, 2, 6, 'darkwood'); set(b, 2 + 1, 2, 6, 'sky'); set(b, 6, 2, 6, 'sky');
  box(b, 6, 6, 3, 1, 2, 1, 'stone'); // chimney
  for (let z = 7; z < 8; z++) b.push([4, 0, z, 'walk']);
  // the neighbor's kitchen
  hollowHouse(b, 10, 1, 6, 6, 3, 'white', 'teal');
  set(b, 12, 1, 6, 'darkwood'); set(b, 12, 2, 6, 'darkwood'); set(b, 14, 2, 6, 'sky'); set(b, 11, 2, 6, 'sky'); set(b, 15, 2, 4, 'sky');
  b.push([12, 0, 7, 'walk']);
  // the workshop: flat roof, a big open door
  box(b, 19, 1, 2, 5, 3, 1, 'wood'); box(b, 19, 1, 6, 5, 3, 1, 'wood'); box(b, 19, 1, 3, 1, 3, 3, 'wood'); box(b, 23, 1, 3, 1, 3, 3, 'wood');
  box(b, 18, 4, 1, 7, 1, 7, 'sky');
  for (const x of [20, 21, 22]) for (const y of [1, 2]) { const i = b.findIndex((q) => q[0] === x && q[1] === y && q[2] === 6); if (i >= 0) b.splice(i, 1); }
  box(b, 20, 1, 4, 2, 1, 1, 'darkwood'); // the workbench inside
  // the garden: soil rows with sprouts, a little fence
  for (let x = 2; x < 9; x++) for (let z = 13; z < 17; z++) b.push([x, 1, z, z % 2 ? 'soil' : 'grass']);
  for (let x = 2; x < 9; x += 2) for (const z of [13, 15]) b.push([x, 2, z, 'sprout']);
  for (let x = 1; x < 10; x++) b.push([x, 1, 12, 'wood']); for (let z = 12; z < 17; z++) b.push([1, 1, z, 'wood'], [9, 1, z, 'wood']);
  // a tree
  box(b, 13, 1, 14, 1, 3, 1, 'darkwood');
  box(b, 12, 4, 13, 3, 2, 3, 'leaf'); box(b, 13, 6, 14, 1, 1, 1, 'leaf2'); set(b, 12, 5, 13, 'leaf2'); set(b, 14, 4, 15, 'leaf2');
  // the pond, sunk into the grass
  for (let x = 18; x < 23; x++) for (let z = 13; z < 16; z++) set(b, x, 0, z, 'water');
  b.push([19, 1, 14, 'pink']); // a lily
  // a mailbox and a lamp post
  box(b, 8, 1, 7, 1, 2, 1, 'darkwood'); b.push([8, 3, 7, 'sun']);
  box(b, 17, 1, 8, 1, 4, 1, 'ink'); b.push([17, 5, 8, 'sun']);
  return b;
}

// FINE DETAIL (B, 15 Nov 2026: "Yes, finer detail"): things in a place are models made of small voxels, 8 to a
// block, so a bed has legs, a headboard and a folded blanket. A fine voxel is [x, y, z, kind, 1/8] in block units.
const F = 8;
function fbox(v, x0, y0, z0, w, h, d, kind) { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) v.push([x, y, z, kind]); }
function place(b, name, ax, ay, az, opts) { for (const [x, y, z, k] of MODELS[name](opts || {})) b.push([ax + x / F, ay + y / F, az + z / F, k, 1 / F]); }

// ---- the street's models (B, 15 Nov 2026: "Yes, do the street") ----
function mHouse(o) { // o: w, d, h in blocks; wall, wall2 (siding), roof, roof2, trim, shutter; door (x in fine units); windows; awning; chimney
  const v = [], W = o.w * F, D = o.d * F, H = o.h * F;
  const hole = (x, y) => (x >= o.door && x < o.door + 6 && y < 14) || o.windows.some(([wx, wy, ww, wh]) => x >= wx && x < wx + ww && y >= wy && y < wy + wh);
  fbox(v, -1, 0, -1, W + 2, 1, D + 2, 'stone'); // the foundation
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
    const corner = (x < 2 || x > W - 3) && (z < 2 || z > D - 3);
    if (z === D - 1 && hole(x, y)) continue; // the front: the door and the windows go here
    v.push([x, y, z, corner ? o.trim : y % 4 === 0 ? o.wall2 : o.wall]);
  }
  // the door, set in a little, with a knob, a lintel and a stone step
  fbox(v, o.door, 1, D - 2, 6, 13, 1, 'darkwood'); v.push([o.door + 4, 7, D - 1, 'sun']); fbox(v, o.door - 1, 14, D - 1, 8, 1, 1, o.trim);
  fbox(v, o.door - 1, 0, D, 8, 1, 3, 'stone');
  // windows: glass, a white frame with a cross bar, shutters, a flower box
  for (const [wx, wy, ww, wh] of o.windows) {
    fbox(v, wx, wy, D - 2, ww, wh, 1, 'glass');
    for (let x = wx - 1; x <= wx + ww; x++) for (let y = wy - 1; y <= wy + wh; y++) if (x === wx - 1 || x === wx + ww || y === wy - 1 || y === wy + wh || x === wx + (ww >> 1) || y === wy + (wh >> 1)) v.push([x, y, D - 1, 'white']);
    fbox(v, wx - 3, wy, D - 1, 2, wh, 1, o.shutter); fbox(v, wx + ww + 1, wy, D - 1, 2, wh, 1, o.shutter);
    fbox(v, wx - 1, wy - 3, D - 1, ww + 2, 2, 2, 'wood'); for (let x = wx; x < wx + ww; x += 2) v.push([x, wy - 1, D, x % 4 ? 'pink' : 'sun']);
  }
  if (o.awning) for (let x = o.awning[0]; x < o.awning[0] + o.awning[1]; x++) for (let k = 0; k < 4; k++) v.push([x, o.awning[2] - k, D - 1 + k, x % 4 < 2 ? 'pink' : 'white']);
  // the gable ends and a pitched roof, one small step per voxel so the slope reads as a slope
  const R = (D >> 1) + 2;
  for (let k = 0; k < R; k++) {
    const z0 = -2 + k, z1 = D + 1 - k; if (z1 < z0) break;
    for (let x = -2; x < W + 2; x++) for (let z = z0; z <= z1; z++) if (z <= z0 + 1 || z >= z1 - 1 || k === R - 1) v.push([x, H + k, z, ((x + 2) % 6 < 3) === (k % 2 === 0) ? o.roof : o.roof2]);
    for (const x of [0, W - 1]) for (let z = Math.max(0, z0 + 2); z <= Math.min(D - 1, z1 - 2); z++) v.push([x, H + k, z, o.wall]);
  }
  if (o.chimney) { fbox(v, o.chimney, H, 6, 5, R + 6, 5, 'stone'); fbox(v, o.chimney - 1, H + R + 6, 5, 7, 1, 7, 'darkwood'); }
  return v;
}
function mWorkshop() { // planks, a flat roof with a lip, big doors swung open, a workbench with tools
  const v = [], W = 40, D = 36, H = 26;
  fbox(v, -1, 0, -1, W + 2, 1, D + 2, 'stone');
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
    if (z === D - 1 && x >= 10 && x < 30 && y < 20) continue; // the big doorway
    v.push([x, y, z, (z === 0 || z === D - 1 ? x : z) % 4 === 0 ? 'darkwood' : 'wood']);
  }
  fbox(v, -2, H, -2, W + 4, 2, D + 4, 'sky'); fbox(v, -2, H + 2, -2, W + 4, 1, 1, 'white'); fbox(v, -2, H + 2, D + 1, W + 4, 1, 1, 'white');
  fbox(v, 2, 1, D, 8, 19, 1, 'teal'); fbox(v, 30, 1, D, 8, 19, 1, 'teal'); // the doors, swung open
  fbox(v, 12, 21, D - 1, 16, 4, 1, 'sun'); // a sign board
  fbox(v, 8, 0, 6, 24, 8, 8, 'wood'); fbox(v, 7, 8, 5, 26, 2, 10, 'darkwood'); // the workbench
  fbox(v, 12, 10, 8, 6, 1, 2, 'stone'); fbox(v, 14, 10, 7, 2, 1, 4, 'wood'); // a hammer
  fbox(v, 22, 10, 9, 7, 1, 2, 'stone'); fbox(v, 20, 10, 9, 2, 2, 2, 'pink'); // a saw
  fbox(v, 8, 12, 1, 24, 10, 1, 'darkwood'); for (let x = 10; x < 30; x += 4) fbox(v, x, 15, 2, 2, 5, 1, x % 8 ? 'sky' : 'pink'); // tools on the wall
  return v;
}
function mTree(o) {
  const v = [], r = o.r || 13, t = o.trunk || 18, cy = t + r - 3;
  fbox(v, -2, 0, -2, 4, t, 4, 'darkwood'); fbox(v, -4, 0, -1, 8, 2, 2, 'darkwood'); fbox(v, -1, 0, -4, 2, 2, 8, 'darkwood'); // trunk and roots
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
    if (x * x + y * y * 1.3 + z * z > r * r) continue;
    const n = (x * 7 + y * 13 + z * 5) & 7; v.push([x, cy + y, z, y > 4 && n < 3 ? 'leaf3' : n < 2 ? 'leaf2' : 'leaf']);
  }
  return v;
}
function mBush(o) {
  const v = [], r = o.r || 5;
  for (let x = -r; x <= r; x++) for (let y = 0; y <= r; y++) for (let z = -r; z <= r; z++) if (x * x + (y * 1.4) ** 2 + z * z <= r * r) v.push([x, y, z, (x + y + z) % 3 ? 'leaf' : 'leaf2']);
  if (o.flowers) for (const [x, z] of [[-2, 1], [2, -2], [0, 3]]) v.push([x, r - 1, z, o.flowers]);
  return v;
}
function mGarden() { // 7 x 4 blocks: a picket fence, soil rows with sprouts and carrot tops, a watering can
  const v = [], W = 56, D = 32;
  for (let x = 0; x < W; x += 3) { fbox(v, x, 0, 0, 1, 7, 1, 'white'); fbox(v, x, 0, D - 1, 1, 7, 1, 'white'); }
  for (let z = 0; z < D; z += 3) { fbox(v, 0, 0, z, 1, 7, 1, 'white'); fbox(v, W - 1, 0, z, 1, 7, 1, 'white'); }
  for (const y of [2, 5]) { fbox(v, 0, y, 0, W, 1, 1, 'white'); fbox(v, 0, y, D - 1, W, 1, 1, 'white'); fbox(v, 0, y, 0, 1, 1, D, 'white'); fbox(v, W - 1, y, 0, 1, 1, D, 'white'); }
  for (let z = 4; z < D - 4; z += 8) {
    fbox(v, 4, 0, z, W - 8, 2, 4, 'soil');
    for (let x = 6; x < W - 6; x += 5) if ((z >> 3) % 2) v.push([x, 2, z + 1, 'orange'], [x, 3, z + 1, 'leaf'], [x - 1, 4, z + 1, 'leaf'], [x + 1, 4, z + 1, 'leaf']);
    else v.push([x, 2, z + 2, 'leaf'], [x, 3, z + 2, 'leaf'], [x - 1, 4, z + 2, 'leaf2'], [x + 1, 4, z + 2, 'leaf2'], [x, 5, z + 2, 'leaf']);
  }
  fbox(v, W - 12, 0, D - 7, 5, 4, 3, 'sky'); fbox(v, W - 7, 2, D - 6, 4, 1, 1, 'sky'); fbox(v, W - 11, 4, D - 6, 3, 2, 1, 'sky'); // a watering can
  return v;
}
function mPond() { // stones round the edge, lily pads, a flower, a duck
  const v = [], rx = 20, rz = 12;
  for (let x = -rx - 2; x <= rx + 2; x++) for (let z = -rz - 2; z <= rz + 2; z++) {
    const d = (x / rx) ** 2 + (z / rz) ** 2;
    if (d <= 1) v.push([x, 0, z, 'water']); else if (d <= 1.35) v.push([x, 0, z, (x + z) % 3 ? 'stone' : 'stone2'], [x, 1, z, (x * z) % 5 ? 'stone' : 'stone2']);
  }
  for (const [x, z] of [[-8, -3], [-4, 4], [6, -5]]) fbox(v, x, 1, z, 4, 1, 3, 'leaf');
  v.push([-6, 2, 5, 'pink'], [-5, 2, 5, 'pink'], [-6, 3, 5, 'sun']);
  fbox(v, 7, 1, 2, 6, 3, 4, 'sun'); fbox(v, 11, 4, 3, 3, 3, 2, 'sun'); fbox(v, 14, 5, 3, 2, 1, 2, 'orange'); v.push([12, 6, 3, 'ink'], [12, 6, 4, 'ink']); // a duck
  return v;
}
function mLamp() { const v = []; fbox(v, -2, 0, -2, 4, 2, 4, 'ink'); fbox(v, -1, 2, -1, 2, 30, 2, 'ink'); fbox(v, -3, 32, -3, 6, 4, 6, 'sun'); fbox(v, -4, 36, -4, 8, 1, 8, 'ink'); return v; }
function mMailbox() { const v = []; fbox(v, 0, 0, 0, 2, 9, 2, 'darkwood'); fbox(v, -2, 9, -3, 6, 5, 8, 'sky'); fbox(v, 4, 11, 0, 1, 5, 1, 'pink'); fbox(v, 4, 15, 0, 1, 1, 3, 'pink'); return v; }
function mBench() {
  const v = [];
  for (const x of [0, 13]) fbox(v, x, 0, 0, 2, 5, 6, 'ink');
  for (const z of [0, 2, 4]) fbox(v, -1, 5, z, 16, 1, 1, 'wood');
  for (const y of [7, 9]) fbox(v, -1, y, 5, 16, 1, 1, 'wood');
  fbox(v, 0, 5, 5, 2, 6, 1, 'ink'); fbox(v, 13, 5, 5, 2, 6, 1, 'ink');
  return v;
}

// The street's places are things you tap to walk there (B, 15 Nov 2026: "Walk the street").
function mKid() { // you: a small walker in the kids colors, facing the way they walk
  const v = [], o = (x, y, z, k) => v.push([x - 3, y, z - 2, k]);
  const f = (x0, y0, z0, w, h, d, k) => { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) o(x, y, z, k); };
  f(1, 0, 1, 2, 1, 3, 'ink'); f(4, 0, 1, 2, 1, 3, 'ink'); f(1, 1, 1, 2, 4, 2, 'sky'); f(4, 1, 1, 2, 4, 2, 'sky');
  f(0, 5, 0, 7, 6, 4, 'sun'); f(-1, 6, 1, 1, 5, 2, 'skin'); f(7, 6, 1, 1, 5, 2, 'skin');
  f(1, 11, 0, 5, 5, 4, 'skin'); f(1, 15, 0, 5, 1, 4, 'hair'); f(1, 12, 0, 5, 3, 1, 'hair');
  o(2, 13, 4, 'ink'); o(4, 13, 4, 'ink'); o(3, 12, 4, 'pink');
  return v;
}
// The village is a small town at a crossroads (B, 17 Nov 2026: "more than just a strip of one street ... an actual
// village"; he picked the crossroads town). Main Street runs east to west (road z 24-25, sidewalks z 23 and 26); Mill
// Road runs north to south (road x 31-32, sidewalks x 30 and 33). Four corners: Home Lane (north-west: your house and
// the neighbors), Main Street shops (north-east), the park side (south-west) and Safety Corner (south-east). Crosswalks
// sit at the crossroads; the walker crosses only there. A thing with turn (quarter turns) faces Mill Road or turns round.
const TOWN = { w: 68, d: 54, ew: [24, 25], ns: [31, 32], walk: { N: 23.5, S: 26.5, W: 30.5, E: 33.5 } };
function streetThings() {
  const house = (o) => ({ w: 6, d: 5, h: 3, trim: 'white', ...o });
  return [
    // Home Lane (north-west): your house, the kitchen next door, two more neighbors
    { id: 'home', model: 'house', opts: house({ wall: 'cream', wall2: 'cream2', roof: 'pink', roof2: 'pink2', shutter: 'teal', door: 21, windows: [[5, 9, 9, 8], [34, 9, 9, 8]], chimney: 36 }), at: [2, 1, 15] },
    { id: 'neighbor', model: 'house', opts: house({ wall: 'white', wall2: 'white2', roof: 'teal', roof2: 'teal2', trim: 'sun', shutter: 'pink', door: 6, windows: [[18, 7, 22, 10]], awning: [16, 26, 21] }), at: [9.5, 1, 15] },
    { id: 'house3', model: 'house', opts: house({ wall: 'sky', wall2: 'white2', roof: 'orange', roof2: 'sun', shutter: 'white', door: 21, windows: [[5, 9, 9, 8], [34, 9, 9, 8]] }), at: [17, 1, 15] },
    { id: 'house4', model: 'house', opts: house({ w: 5, wall: 'pink', wall2: 'pink2', roof: 'teal', roof2: 'teal2', shutter: 'white', door: 17, windows: [[4, 9, 9, 8]], chimney: 30 }), at: [23.6, 1, 15] },
    // Main Street (north-east): the market, the repair cafe, the library, the bakery; the post office faces Mill Road
    { id: 'market', model: 'house', opts: house({ wall: 'sky', wall2: 'white2', roof: 'sun', roof2: 'orange', shutter: 'pink', door: 22, windows: [[4, 7, 14, 10], [32, 7, 12, 10]], awning: [2, 44, 20] }), at: [35.5, 1, 15] },
    { id: 'cafehouse', model: 'house', opts: house({ wall: 'sun', wall2: 'cheese2', roof: 'teal', roof2: 'teal2', shutter: 'teal', door: 22, windows: [[4, 7, 14, 10], [32, 7, 12, 10]], awning: [2, 44, 20] }), at: [43, 1, 15] },
    { id: 'libraryhouse', model: 'libraryhouse', at: [50.5, 1, 15.2] },
    { id: 'bakery', model: 'house', opts: house({ wall: 'cream', wall2: 'cream2', roof: 'orange', roof2: 'pink2', shutter: 'pink', door: 22, windows: [[4, 7, 14, 10], [32, 7, 12, 10]], awning: [2, 44, 20], chimney: 38 }), at: [58.5, 1, 15] },
    { id: 'posthouse', model: 'shopfront', opts: { w: 6, wall: 'white', wall2: 'pwall2', door: 'sky', roof: 'sky', sign: 'sky' }, at: [34.6, 1, 12], turn: 1 },
    // the park side (south-west): the garden, the park, a farm stand; the workshop faces Mill Road
    { id: 'garden', model: 'garden', at: [2, 1, 28] },
    { id: 'parkgate', model: 'parksign', at: [14, 1, 27.4] },
    { id: 'farmstand', model: 'stand', opts: { w: 4, c: 'wood', top: 'pink' }, at: [21, 1, 27.6] },
    { id: 'workshop', model: 'workshop', at: [24.4, 1, 43], turn: 1 },
    // Safety Corner (south-east): the town square at the crossroads, the fire station, the clinic, the school and its bus stop
    { id: 'squaregate', model: 'fountain', at: [38.5, 1, 30.5] },
    { id: 'firehouse', model: 'firehouse', at: [43.5, 1, 27.6] },
    { id: 'clinic', model: 'shopfront', opts: { w: 6, wall: 'white', wall2: 'white2', door: 'teal', roof: 'teal', sign: 'teal' }, at: [52, 1, 27.6] },
    { id: 'school', model: 'libraryhouse', at: [65.5, 1, 33.4], turn: 2 },
    { id: 'busstop', model: 'busSignHi', scale: 1.6, at: [58.6, 1, 27.2] },
    { id: 'walker', model: 'kid', at: [5, 1, 23.5] },
  ];
}
// Where each door is, and which sidewalk it opens onto (N or S of Main Street, W or E of Mill Road).
const STREET_DOORS = {
  home: { place: 'room', name: 'your house', at: [5.0, 21.3], edge: 'N' },
  neighbor: { place: 'kitchen', name: 'the kitchen next door', at: [10.8, 21.3], edge: 'N' },
  market: { place: 'market', name: 'the market', at: [38.6, 21.3], edge: 'N' },
  cafehouse: { place: 'cafe', name: 'the repair cafe', at: [46.0, 21.3], edge: 'N' },
  libraryhouse: { place: 'library', name: 'the library', at: [53.5, 22.2], edge: 'N' },
  posthouse: { place: 'post', name: 'the post office', at: [34.0, 7.9], edge: 'E' },
  garden: { place: 'yard', name: 'the garden', at: [5.9, 27.6], edge: 'S' },
  parkgate: { place: 'park', name: 'the park', at: [14.6, 27.0], edge: 'S' },
  workshop: { place: 'shop', name: 'the workshop', at: [29.5, 40.5], edge: 'W' },
  squaregate: { place: 'square', name: 'the town square', at: [38.5, 27.0], edge: 'S' },
  firehouse: { place: 'station', name: 'the fire station', at: [48.4, 27.0], edge: 'S' },
  school: { place: 'school', name: 'the school', at: [62.5, 27.9], edge: 'S' },
  clinic: { place: 'clinic', name: 'the clinic', at: [56.2, 27.0], edge: 'S' },
  bakery: { place: 'bakery', name: 'the bakery', at: [61.4, 21.3], edge: 'N' },
  farmstand: { place: 'farmstand', name: 'the farm stand', at: [23.0, 27.0], edge: 'S' },
  house3: { place: 'pethouse', name: 'the house with the dog', at: [20.0, 21.3], edge: 'N' },
  house4: { place: 'laundry', name: 'your neighbor\'s laundry room', at: [26.1, 21.3], edge: 'N' },
  busstop: { place: 'busstop', name: 'the bus stop', at: [58.0, 27.0], edge: 'S' },
};

function street() {
  const b = [], [r0, r1] = TOWN.ew, [c0, c1] = TOWN.ns;
  // the ground: grass, the two roads with dashed middle lines, sidewalks beside them, striped crosswalks at the crossroads
  for (let x = 0; x < TOWN.w; x++) for (let z = 0; z < TOWN.d; z++) {
    const onEW = z === r0 || z === r1, onNS = x === c0 || x === c1, sideEW = z === r0 - 1 || z === r1 + 1, sideNS = x === c0 - 1 || x === c1 + 1;
    let k = (x * 7 + z * 3) % 11 ? 'grass' : 'grass2';
    if (onEW || onNS) {
      k = 'road';
      if (onEW && sideNS) k = 'white';                                   // crosswalks over Main Street, at the corners
      else if (onNS && sideEW) k = 'white';                              // crosswalks over Mill Road
      else if (onEW && !onNS && z === r0 && x % 3 === 1 && Math.abs(x - c0) > 3) k = 'line';
      else if (onNS && !onEW && x === c0 && z % 3 === 1 && Math.abs(z - r0) > 3) k = 'line';
    } else if (sideEW || sideNS) k = 'walk';
    b.push([x, 0, z, k]);
  }
  // paths from the doors to the sidewalk
  const at = (x, z, k) => { b[x * TOWN.d + z][3] = k; };
  for (const [x, z0, z1] of [[5, 21, 23], [10, 21, 23], [20, 21, 23], [26, 21, 23], [38, 21, 23], [46, 21, 23], [53, 21, 23], [61, 21, 23], [5, 27, 28], [14, 27, 28], [23, 27, 28], [38, 27, 28], [48, 27, 28], [56, 27, 28], [62, 27, 28]]) for (let z = z0; z < z1; z++) at(x, z, 'walk');
  for (let x = 33; x < 66; x++) at(x, 34, 'walk'); // the school path
  // trees, lamps, benches, a pond behind the park, bushes by the houses
  for (const [x, z, r] of [[3, 4, 12], [12, 7, 14], [22, 3, 12], [40, 5, 12], [50, 8, 14], [62, 4, 12], [4, 44, 14], [12, 48, 12], [38, 46, 12], [48, 44, 14], [58, 49, 12], [26, 10, 10], [18, 50, 10]]) place(b, 'tree', x, 1, z, { r, trunk: r + 4 });
  place(b, 'pond', 9, 1, 36);
  for (const [x, z] of [[8, 22.6], [18, 26.4], [28, 22.6], [36.6, 22.6], [48, 26.4], [60, 22.6], [29.4, 12], [33.6, 40], [29.4, 50]]) place(b, 'lamp', x, 1, z);
  place(b, 'mailbox', 7.6, 1, 22.2); place(b, 'bench', 18.4, 1, 27.2); place(b, 'bench', 42, 1, 33.6);
  for (const [x, z, f] of [[1.2, 21.6, 'pink'], [8.4, 21.6, null], [16.2, 21.6, 'sun'], [22.8, 21.6, null], [42.2, 21.6, 'pink'], [57.6, 21.6, 'sun']]) place(b, 'bush', x, 1, z, f ? { r: 5, flowers: f } : { r: 5 });
  return b;
}

// Models, in fine units (8 = one block). x across, y up, z deep.
function mBed() { // 3 blocks wide, 5 long
  const v = [];
  for (const [x, z] of [[0, 2], [21, 2], [0, 37], [21, 37]]) fbox(v, x, 0, z, 3, 4, 3, 'darkwood'); // legs
  fbox(v, 0, 4, 2, 24, 2, 38, 'wood');                       // frame
  fbox(v, 1, 6, 3, 22, 3, 36, 'mattress');                   // mattress
  fbox(v, 0, 8, 13, 24, 2, 27, 'blanket');                   // blanket on top
  fbox(v, 0, 5, 13, 1, 3, 27, 'blanket'); fbox(v, 23, 5, 13, 1, 3, 27, 'blanket'); // blanket hanging over the sides
  fbox(v, 0, 10, 13, 24, 1, 3, 'pillow');                    // the folded edge
  fbox(v, 4, 9, 4, 16, 3, 7, 'pillow');                      // pillow
  fbox(v, 0, 0, 0, 24, 15, 2, 'wood'); fbox(v, 0, 15, 0, 24, 1, 2, 'darkwood'); // headboard
  for (let x = 3; x < 22; x += 6) fbox(v, x, 4, 2, 2, 9, 1, 'darkwood'); // headboard slats
  return v;
}
function mDesk() { // 2 blocks wide, 1.5 deep
  const v = [];
  fbox(v, 0, 10, 0, 16, 2, 12, 'wood');                      // top
  for (const [x, z] of [[0, 0], [14, 0], [0, 10], [14, 10]]) fbox(v, x, 0, z, 2, 10, 2, 'darkwood'); // legs
  fbox(v, 9, 6, 1, 6, 4, 10, 'wood'); fbox(v, 11, 7, 11, 2, 1, 1, 'sun'); // drawer and its knob
  fbox(v, 2, 12, 2, 3, 1, 3, 'ink'); fbox(v, 3, 13, 3, 1, 6, 1, 'ink'); fbox(v, 1, 18, 1, 5, 3, 5, 'sun'); // lamp
  fbox(v, 7, 12, 3, 6, 1, 5, 'book2'); fbox(v, 7, 13, 3, 6, 1, 5, 'book3');                                  // two books
  return v;
}
function mChair() {
  const v = [];
  for (const [x, z] of [[0, 0], [7, 0], [0, 7], [7, 7]]) fbox(v, x, 0, z, 1, 6, 1, 'darkwood');
  fbox(v, 0, 6, 0, 8, 1, 8, 'teal'); fbox(v, 0, 7, 7, 8, 7, 1, 'teal');
  return v;
}
function mToyBox() { // open, the lid standing up at the back, so toys can go in
  const v = [];
  for (let x = 0; x < 14; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 8; z++) if (y === 0 || x === 0 || x === 13 || z === 0 || z === 7) v.push([x, y, z, 'sun']);
  fbox(v, 0, 7, -1, 14, 7, 1, 'teal'); fbox(v, 6, 4, 8, 2, 2, 1, 'darkwood'); // lid and handle
  fbox(v, 1, 1, 1, 3, 3, 3, 'sky'); fbox(v, 10, 1, 2, 3, 4, 3, 'teal'); // blocks already inside, with room for the ball
  return v;
}
function mBall() { const v = []; for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 5; z++) if ((x - 2) ** 2 + (y - 2) ** 2 + (z - 2) ** 2 <= 5) v.push([x, y, z, (x + y) % 3 ? 'pink' : 'white']); return v; }
function mBedMessy() { // the same bed, unmade: blanket pushed down in a heap, pillow crooked
  const v = mBed().filter(([x, y, z, k]) => k !== 'blanket' && k !== 'pillow');
  fbox(v, 2, 9, 26, 20, 2, 12, 'blanket'); fbox(v, 5, 11, 28, 12, 2, 7, 'blanket'); fbox(v, 0, 5, 30, 1, 4, 8, 'blanket'); fbox(v, 9, 13, 30, 5, 1, 4, 'blanket');
  fbox(v, 9, 9, 6, 14, 3, 7, 'pillow');
  return v;
}
function mRug() { // 3 x 3 blocks, one fine voxel thick, with stripes
  const v = [];
  for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) v.push([x, 0, z, (x === 2 || x === 21 || z === 2 || z === 21) ? 'sun' : (x + z) % 8 < 1 ? 'teal2' : 'rug']);
  return v;
}
function mBook(o) { const v = []; fbox(v, 0, 0, 0, 6, 1, 4, o.c || 'book1'); fbox(v, 0, 0, 0, 1, 1, 4, 'darkwood'); return v; } // a book lying flat, its spine dark
function mWindow() { // set into the back wall: frame, glass, curtains, sill
  const v = [];
  fbox(v, 0, 0, 0, 18, 1, 2, 'white'); fbox(v, 0, 15, 0, 18, 1, 2, 'white'); fbox(v, 0, 0, 0, 1, 16, 2, 'white'); fbox(v, 17, 0, 0, 1, 16, 2, 'white'); fbox(v, 8, 0, 0, 2, 16, 1, 'white');
  fbox(v, 1, 1, 0, 7, 14, 1, 'glass'); fbox(v, 10, 1, 0, 7, 14, 1, 'glass');
  fbox(v, -3, -2, 1, 3, 18, 1, 'pink'); fbox(v, 18, -2, 1, 3, 18, 1, 'pink'); fbox(v, -1, -1, 1, 20, 1, 3, 'white');
  return v;
}
function mPlant() {
  const v = [];
  fbox(v, 0, 0, 0, 5, 4, 5, 'pink'); fbox(v, 1, 4, 1, 3, 1, 3, 'soil');
  for (const [x, y, z] of [[2, 5, 2], [2, 6, 2], [1, 7, 2], [3, 7, 2], [2, 8, 1], [2, 8, 3], [0, 8, 2], [4, 8, 2], [2, 9, 2]]) v.push([x, y, z, 'leaf']);
  return v;
}
function mShelf() {
  const v = [];
  fbox(v, 0, 0, 0, 22, 1, 4, 'wood'); fbox(v, 1, -2, 0, 1, 2, 2, 'darkwood'); fbox(v, 20, -2, 0, 1, 2, 2, 'darkwood'); // room at the right end for the books from the floor
  const c = ['book1', 'book2', 'book3', 'teal', 'book1', 'sun']; for (let i = 0; i < 6; i++) fbox(v, 1 + i * 2, 1, 1, 2, 5 - (i % 3), 3, c[i]);
  return v;
}
// ---- the neighbor's kitchen (B, 15 Nov 2026: "Wash hands, kitchen") ----
function mCounter(o) { // base cabinets with doors and knobs, a countertop, and a sink basin cut in at o.sink (fine x)
  const v = [], W = (o.w || 8) * F, D = o.d ? o.d * F : 10, H = 9, sx = o.sink;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) {
    if (y === 0 && z === D - 1) { v.push([x, y, z, 'darkwood']); continue; } // toe kick
    const inBasin = sx !== undefined && x >= sx && x < sx + 14 && z >= 2 && z < 9;
    if (inBasin && y >= H - 3) { const side = x === sx || x === sx + 13 || z === 2 || z === 8; if (y === H - 3 || side) v.push([x, y, z, y === H - 3 && !side ? 'stone2' : 'stone']); continue; } // the basin, hollow
    const front = z === D - 1, door = x % 10;
    v.push([x, y, z, front && (door === 0 || door === 9 || y === H - 1 || y === 1) ? 'wood' : front ? 'cabinet' : 'wood']);
  }
  for (let x = 4; x < W; x += 10) v.push([x, 6, D, 'sun']); // knobs
  for (let x = -1; x <= W; x++) for (let z = 0; z <= D; z++) {
    const basin = sx !== undefined && x >= sx && x < sx + 14 && z >= 2 && z < 9;
    if (basin) { if (x === sx || x === sx + 13 || z === 2 || z === 8) v.push([x, H, z, 'stone']); continue; }
    v.push([x, H, z, 'counter']);
  }
  return v;
}
function mFaucet() { const v = []; fbox(v, 0, 0, 0, 2, 7, 2, 'stone'); fbox(v, 0, 7, 0, 2, 2, 6, 'stone'); fbox(v, 0, 5, 6, 2, 2, 1, 'stone'); fbox(v, -3, 2, 0, 3, 2, 2, 'sky'); fbox(v, 2, 2, 0, 3, 2, 2, 'pink'); return v; } // cold and warm handles
function mStream() { const v = []; fbox(v, 0, 0, 0, 1, 7, 1, 'water'); fbox(v, -1, 0, -1, 3, 1, 3, 'water'); return v; }
function mSoap() { const v = []; fbox(v, 0, 0, 0, 4, 6, 4, 'teal'); fbox(v, 1, 6, 1, 2, 2, 2, 'white'); fbox(v, 1, 8, 1, 4, 1, 1, 'white'); fbox(v, 1, 2, 4, 2, 2, 1, 'white'); return v; }
function mHands() { // two hands held over the sink, palms down, a little apart
  const v = [];
  for (const ox of [0, 9]) { fbox(v, ox, 0, 0, 6, 2, 6, 'skin'); for (let f = 0; f < 4; f++) fbox(v, ox + f + (f > 1 ? 1 : 0) + 0, 0, 6, 1, 1, 3, 'skin'); fbox(v, ox + (ox ? -1 : 6), 0, 1, 1, 1, 3, 'skin'); fbox(v, ox + 1, 0, -4, 4, 2, 4, 'sleeve'); }
  return v;
}
function mBubbles() { const v = []; for (const [x, y, z, r] of [[2, 3, 3, 2], [11, 3, 2, 2], [6, 4, 5, 1], [14, 3, 6, 1], [0, 3, 7, 1], [8, 2, 1, 1]]) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) if (a * a + b * b + c * c <= r * r) v.push([x + a, y + b, z + c, 'bubble']); return v; }
function mTowel() { const v = []; fbox(v, 0, 10, 0, 8, 1, 1, 'ink'); fbox(v, 0, 9, 0, 1, 2, 2, 'ink'); fbox(v, 7, 9, 0, 1, 2, 2, 'ink'); fbox(v, 1, 0, 1, 6, 10, 1, 'pink'); for (let x = 1; x < 7; x++) v.push([x, 2, 2, 'white']); return v; }
function mFridge() { const v = []; fbox(v, 0, 0, 0, 12, 30, 10, 'white'); fbox(v, 0, 18, 10, 12, 1, 1, 'white2'); fbox(v, 10, 8, 10, 1, 8, 1, 'stone'); fbox(v, 10, 20, 10, 1, 6, 1, 'stone'); for (const [x, y, c] of [[3, 24, 'pink'], [6, 22, 'sun'], [4, 12, 'teal']]) fbox(v, x, y, 10, 2, 2, 1, c); return v; }
function mStove() { const v = []; fbox(v, 0, 0, 0, 12, 9, 10, 'stone'); fbox(v, 1, 2, 10, 10, 5, 1, 'ink'); fbox(v, 0, 9, 0, 12, 1, 10, 'ink'); for (const [x, z] of [[2, 2], [7, 2], [2, 6], [7, 6]]) fbox(v, x, 10, z, 3, 1, 3, 'stone2'); fbox(v, 1, 10, 1, 5, 4, 5, 'teal'); fbox(v, 0, 13, 3, 1, 1, 1, 'ink'); return v; }
function mTable(o) { const v = []; fbox(v, 0, 9, 0, 20, 2, 14, 'wood'); for (const [x, z] of [[1, 1], [17, 1], [1, 11], [17, 11]]) fbox(v, x, 0, z, 2, 9, 2, 'darkwood'); if (o && o.bowl === false) return v; fbox(v, 7, 11, 5, 6, 2, 4, 'white'); v.push([8, 13, 6, 'orange'], [10, 13, 6, 'pink'], [9, 13, 7, 'leaf'], [11, 13, 7, 'sun']); return v; } // with a fruit bowl
function mStool() { const v = []; for (const [x, z] of [[0, 0], [5, 0], [0, 5], [5, 5]]) fbox(v, x, 0, z, 1, 7, 1, 'darkwood'); fbox(v, 0, 7, 0, 6, 1, 6, 'sun'); return v; }

// ---- your bathroom (B, 15 Nov 2026: "Brush teeth, house") ----
function mMirror() { const v = []; fbox(v, 0, 0, 0, 20, 18, 1, 'white'); fbox(v, 1, 1, 1, 18, 16, 1, 'mirror'); return v; }
function mFace() { // a happy face in the mirror: you
  const v = [];
  for (let x = 0; x < 11; x++) for (let y = 0; y < 12; y++) if (((x - 5) / 5.5) ** 2 + ((y - 5.5) / 6) ** 2 <= 1) v.push([x, y, 0, 'skin']);
  for (let x = 0; x < 11; x++) for (let y = 8; y < 13; y++) if (((x - 5) / 6) ** 2 + ((y - 7) / 5.5) ** 2 <= 1 && y >= 9) v.push([x, y, 0, 'hair']);
  v.push([3, 7, 1, 'ink'], [7, 7, 1, 'ink']);
  fbox(v, 2, 3, 1, 7, 1, 1, 'ink'); fbox(v, 3, 2, 1, 5, 1, 1, 'ink'); fbox(v, 3, 3, 1, 5, 1, 1, 'white'); // a big smile with teeth
  return v;
}
function mFoam() { const v = []; for (const [x, y] of [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0], [1, -1], [3, -1], [5, -1]]) v.push([x, y, 0, 'bubble']); return v; }
function mCup() { const v = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 4; z++) if (y === 0 || x === 0 || x === 3 || z === 0 || z === 3) v.push([x, y, z, 'sky']); return v; }
function mBrushUp(o) { const v = []; fbox(v, 0, 0, 0, 1, 8, 1, o.c || 'teal'); fbox(v, 0, 8, 0, 1, 2, 2, 'white'); return v; } // a toothbrush standing in its cup
function mBrush() { const v = []; fbox(v, 0, 0, 0, 7, 1, 1, 'teal'); fbox(v, 6, 1, 0, 2, 1, 1, 'white'); return v; } // the toothbrush, held over the sink
function mBlob() { const v = []; v.push([0, 0, 0, 'white'], [1, 0, 0, 'teal'], [0, 1, 0, 'teal']); return v; } // a pea-sized blob of toothpaste
function mPaste() { const v = []; fbox(v, 0, 0, 0, 6, 2, 3, 'white'); fbox(v, 1, 0, 0, 4, 2, 3, 'pink'); fbox(v, 6, 0, 1, 2, 1, 1, 'teal'); return v; }
function mTub() { // a bathtub along the wall, water in it, a duck on the rim
  const v = [], W = 18, D = 34, H = 8;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === 0 || x < 2 || x > W - 3 || z < 2 || z > D - 3) v.push([x, y, z, 'white']);
  fbox(v, 2, 5, 2, W - 4, 1, D - 4, 'water');
  fbox(v, 7, 8, D - 6, 3, 2, 3, 'sun'); fbox(v, 9, 10, D - 5, 2, 2, 2, 'sun'); v.push([11, 10, D - 5, 'orange'], [9, 11, D - 4, 'ink']); // a rubber duck
  fbox(v, 7, 8, 0, 2, 6, 2, 'stone'); fbox(v, 7, 13, 0, 2, 1, 5, 'stone'); // the tap
  return v;
}
function mMat() { const v = []; for (let x = 0; x < 14; x++) for (let z = 0; z < 10; z++) v.push([x, 0, z, (x + z) % 4 < 2 ? 'teal' : 'teal2']); return v; }


// ---- the bigger scale (B, 17 Nov 2026: "not enough detail ... make them bigger so we can make the pieces more
// accurate"). The things a child looks for are drawn with 32 cubes to a block (four times finer), at picture-book size,
// so a toothbrush has a handle, a neck and rows of bristles, and a bean seed is a bean. v.res tells the view the detail.
function hi(v) { v.res = 32; return v; }
function ell(v, cx, cy, cz, rx, ry, rz, kind) { for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1) v.push([x, y, z, kind]); }
function mFaucetHi() { const v = []; fbox(v, 0, 0, 0, 8, 2, 7, 'stone2'); fbox(v, 2, 2, 1, 4, 14, 4, 'stone'); fbox(v, 2, 14, 1, 4, 4, 15, 'stone'); fbox(v, 2, 11, 13, 4, 3, 4, 'stone2'); fbox(v, -7, 5, 1, 7, 4, 4, 'sky'); fbox(v, -8, 4, 0, 2, 6, 6, 'sky'); fbox(v, 8, 5, 1, 7, 4, 4, 'pink'); fbox(v, 14, 4, 0, 2, 6, 6, 'pink'); return hi(v); } // a tap with a cold (blue) and a warm (pink) handle
function mStreamHi() { const v = []; fbox(v, 0, 0, 0, 3, 30, 3, 'water'); fbox(v, -2, 0, -2, 7, 1, 7, 'water'); v.push([-3, 1, 1, 'water'], [5, 1, 1, 'water'], [1, 1, -3, 'water'], [1, 1, 5, 'water']); return hi(v); }
function mPasteHi() { // a toothpaste tube lying on the counter: a crimped end, a white tube with a pink band, a teal cap
  const v = [];
  fbox(v, 0, 0, 0, 4, 1, 10, 'white'); for (let z = 0; z < 10; z += 2) v.push([1, 1, z, 'white2']);
  for (let x = 4; x < 26; x++) { const h = x < 8 ? 3 + (x - 4) : 7; fbox(v, x, 0, 1, 1, h, 8, x >= 11 && x < 20 ? 'pink' : 'white'); }
  fbox(v, 13, 7, 3, 5, 1, 4, 'white'); fbox(v, 26, 1, 2, 2, 5, 6, 'white'); fbox(v, 28, 1, 2, 5, 5, 6, 'teal'); for (let y = 2; y < 6; y += 2) fbox(v, 28, y, 1, 5, 1, 1, 'teal2');
  return hi(v);
}
function mCupHi() { const v = []; for (let x = 0; x < 13; x++) for (let z = 0; z < 13; z++) { const d = Math.hypot(x - 6, z - 6); if (d > 6.4) continue; for (let y = 0; y < 15; y++) if (y === 0 || d > 5.2) v.push([x, y, z, y >= 9 && y < 11 ? 'white' : 'sky']); } return hi(v); } // a round cup
function mBrushStand(o) { const v = [], c = o.c || 'teal'; fbox(v, 0, 0, 0, 3, 38, 3, c); fbox(v, 0, 10, 0, 3, 8, 3, c === 'pink' ? 'pink2' : 'teal2'); fbox(v, 0, 38, 1, 3, 4, 2, c); fbox(v, 0, 42, 0, 3, 9, 3, c); for (let y = 43; y < 50; y++) fbox(v, 0, y, 3, 3, 1, 4, y % 2 ? 'white' : 'sky'); return hi(v); } // a toothbrush standing in its cup, bristles out
function mBrushHi() { // the toothbrush, held over the sink: a handle with a grip, a thin neck, a head with rows of bristles
  const v = []; fbox(v, 0, 0, 0, 30, 4, 4, 'teal'); fbox(v, 6, 0, 0, 10, 4, 4, 'teal2'); for (let x = 7; x < 16; x += 2) fbox(v, x, 4, 1, 1, 1, 2, 'white');
  fbox(v, 30, 1, 1, 6, 2, 2, 'teal'); fbox(v, 36, 0, 0, 11, 2, 4, 'teal');
  for (let x = 37; x < 46; x++) fbox(v, x, 2, 0, 1, 4, 4, x % 2 ? 'white' : 'sky');
  return hi(v);
}
function mBlobHi() { const v = []; ell(v, 3, 2.5, 2.5, 3, 2.5, 2.5, 'white'); v.push([2, 4, 2, 'teal'], [3, 4, 3, 'teal'], [4, 3, 2, 'teal'], [3, 5, 2, 'white']); return hi(v); } // a blob the size of a pea
function mFaceHi() { // you, in the mirror: a round face, hair, eyes that look back, rosy cheeks and a big smile with teeth
  const v = [], W = 64, H = 70, cx = 31.5, cy = 33;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { const e = ((x - cx) / 29) ** 2 + ((y - cy) / 31) ** 2; if (e <= 1) v.push([x, y, 0, 'skin']); }
  for (let x = 0; x < W; x++) for (let y = 40; y < H + 4; y++) { const e = ((x - cx) / 32) ** 2 + ((y - 44) / 26) ** 2; if (e <= 1 && (y > 50 || x < 10 || x > 53)) v.push([x, y, 1, 'hair']); }
  for (const ex of [19, 44]) { ell(v, ex, 37, 1, 6.5, 5.5, 0.5, 'white'); ell(v, ex, 36, 2, 3.5, 3.5, 0.5, 'ink'); v.push([ex + 1, 38, 3, 'white'], [ex + 2, 38, 3, 'white'], [ex + 1, 39, 3, 'white']); fbox(v, ex - 6, 46, 1, 12, 2, 1, 'hair'); }
  ell(v, 9, 26, 1, 4, 3, 0.4, 'pink'); ell(v, 54, 26, 1, 4, 3, 0.4, 'pink');
  ell(v, 31.5, 27, 1.5, 3, 2.5, 0.6, 'skin2'); // the nose
  for (let x = 16; x < 48; x++) { const d = Math.abs(x - 31.5) / 16, top = 20 - Math.round(d * d * 4), bot = 11 + Math.round(d * d * 8); for (let y = bot; y <= top; y++) v.push([x, y, 1, y >= top - 3 ? 'white' : y <= bot + 1 ? 'ink' : 'mouth']); }
  for (let x = 19; x < 46; x += 4) fbox(v, x, 17, 1, 1, 4, 1, 'toothline'); // the lines between teeth
  return hi(v);
}
function mFoamHi() { const v = []; for (const [x, y, r] of [[4, 4, 3], [11, 6, 3.5], [19, 5, 3], [26, 6, 3.5], [33, 4, 3], [8, 0, 2.5], [16, 0, 2.5], [24, 0, 2.5], [31, 0, 2.5]]) ell(v, x, y, 2, r, r, 2, 'bubble'); return hi(v); } // toothpaste foam around the smile
function mSunHi() { // a friendly sun: a round face, rays all round, eyes and a smile
  const v = [], R = 21;
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) { const d = Math.hypot(x, y); if (d > R) continue; const t = Math.round(4 * Math.sqrt(1 - (d / R) ** 2)) + 1; for (let z = -t; z <= t; z++) v.push([x, y, z, d > R - 2 ? 'orange' : 'sun']); }
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; for (let r = R + 3; r < R + (k % 2 ? 9 : 13); r++) fbox(v, Math.round(Math.cos(a) * r) - 1, Math.round(Math.sin(a) * r) - 1, -1, 3, 3, 3, 'orange'); }
  for (const ex of [-8, 8]) { ell(v, ex, 5, 6, 2.5, 3.5, 1, 'ink'); v.push([ex + 1, 7, 7, 'white']); }
  for (let x = -9; x <= 9; x++) { const y = -6 - Math.round(4 * Math.sqrt(Math.max(0, 1 - (x / 9.5) ** 2))); fbox(v, x, y, 6, 1, 2, 1, 'ink'); }
  ell(v, -13, -3, 5, 3, 2, 1, 'pink'); ell(v, 13, -3, 5, 3, 2, 1, 'pink');
  return hi(v);
}
function mTrowelHi() { // a garden trowel lying on the grass: wooden handle, a ring, a pointed scoop
  const v = []; fbox(v, 0, 0, 0, 6, 5, 13, 'wood'); fbox(v, 0, 5, 2, 6, 1, 9, 'darkwood'); fbox(v, 0, 0, 13, 6, 5, 2, 'ink'); fbox(v, 2, 1, 15, 2, 2, 4, 'stone2');
  for (let z = 19; z < 36; z++) { const w = z < 29 ? 14 : Math.max(2, 14 - (z - 29) * 2), x0 = 3 - Math.floor(w / 2); fbox(v, x0, 0, z, w, 1, 1, 'stone'); v.push([x0, 1, z, 'stone2'], [x0 + w - 1, 1, z, 'stone2']); }
  return hi(v);
}
function mSeedsHi() { // a seed packet standing up: a picture of the bean plant and its beans on the front
  const v = []; fbox(v, 0, 0, 0, 20, 28, 2, 'white'); fbox(v, 0, 23, 0, 20, 5, 2, 'leaf'); for (let x = 1; x < 20; x += 3) v.push([x, 28, 0, 'white2']);
  fbox(v, 9, 7, 2, 2, 12, 1, 'leaf2'); ell(v, 6, 15, 2, 3, 2, 0.5, 'leaf'); ell(v, 14, 17, 2, 3, 2, 0.5, 'leaf'); ell(v, 9.5, 20, 2, 2.5, 1.6, 0.5, 'leaf3');
  ell(v, 5, 4, 2, 2.6, 1.6, 0.5, 'bean'); ell(v, 14, 4, 2, 2.6, 1.6, 0.5, 'bean'); fbox(v, 0, 0, -6, 20, 2, 6, 'white');
  return hi(v);
}
function mCanHi() { // a watering can: a body, a handle on top, a long spout with a sprinkler rose
  const v = []; fbox(v, 0, 0, 0, 16, 15, 12, 'sky'); fbox(v, 0, 15, 0, 16, 1, 12, 'teal'); fbox(v, 3, 6, 12, 10, 3, 1, 'white');
  fbox(v, 2, 16, 5, 2, 6, 2, 'teal'); fbox(v, 12, 16, 5, 2, 6, 2, 'teal'); fbox(v, 2, 22, 5, 12, 2, 2, 'teal');
  for (let i = 0; i < 15; i++) fbox(v, 16 + i, 3 + Math.round(i * 0.8), 5, 1, 2, 2, 'sky');
  fbox(v, 30, 13, 3, 3, 4, 6, 'teal'); return hi(v);
}
function mHoleHi() { const v = []; for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) { const d = Math.hypot(x, z); if (d <= 6.5) v.push([x, 0, z, 'hole']); else if (d <= 9) v.push([x, 1, z, 'soil2']); } return hi(v); } // a little hole with the dug soil heaped round it
function mBeanHi() { const v = []; ell(v, 0, 3, 0, 6, 3, 4, 'bean'); fbox(v, -1, 3, -4, 3, 2, 1, 'darkwood'); return hi(v); } // one bean seed, the size you see, its little eye showing
function mMoundHi() { const v = []; for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) { const h = Math.round(4 - (x * x + z * z) / 22); for (let y = 0; y < h; y++) v.push([x, y, z, (x + z) % 3 ? 'soil2' : 'soil']); } return hi(v); }
function mDropsHi() { const v = []; for (const [x, y, z] of [[0, 30, 0], [6, 24, 3], [-5, 20, -2], [3, 14, -4], [-3, 10, 4], [7, 6, -1], [-6, 3, 1]]) { fbox(v, x, y, z, 2, 3, 2, 'water'); v.push([x, y + 3, z, 'water']); } return hi(v); }
function mSproutHi() { const v = []; fbox(v, 0, 0, 0, 2, 14, 2, 'leaf2'); ell(v, -4, 15, 1, 4, 1.2, 2.5, 'leaf3'); ell(v, 6, 15, 1, 4, 1.2, 2.5, 'leaf3'); ell(v, 1, 18, 1, 2, 2, 0.8, 'leaf'); return hi(v); } // a stem and its first two round leaves
function trio(v, cx, cy, cz) { for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6]]) ell(v, cx + dx, cy, cz + dz, 4.5, 0.8, 3.5, (dx + dz) % 4 ? 'leaf' : 'leaf3'); fbox(v, cx, cy - 1, cz - 1, 1, 1, 2, 'leaf2'); } // a bean leaf comes in threes
function mBeanPlantHi() { const v = []; fbox(v, 0, 0, 0, 3, 34, 3, 'leaf2'); for (const [x, y, z] of [[-8, 12, 2], [9, 17, 0], [0, 22, -8], [-6, 27, 5], [7, 31, -3], [1, 35, 2]]) { trio(v, x, y, z); fbox(v, Math.min(0, x), y - 1, 1, Math.abs(x) + 1, 1, 1, 'leaf2'); } return hi(v); }
function mFlowersHi() { const v = []; for (const [x, y, z] of [[-6, 20, 4], [6, 24, 2], [-2, 29, -5], [4, 33, 4], [-8, 15, -2]]) { ell(v, x, y, z, 2, 1.2, 2, 'white'); v.push([x, y + 1, z, 'pink']); } return hi(v); }
function mPodsHi() { const v = []; for (const [x, y, z] of [[-6, 20, 4], [6, 24, 2], [-2, 29, -5], [4, 33, 4], [-8, 15, -2]]) { fbox(v, x, y - 14, z, 2, 14, 3, 'leaf2'); for (let k = 2; k < 13; k += 4) v.push([x - 1, y - k, z + 1, 'leaf']); } return hi(v); } // green bean pods hanging down
function mWeedHi() { const v = []; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) for (let k = 1; k < 10; k++) { v.push([Math.round(dx * k), 0, Math.round(dz * k), 'weed']); if (k % 3 === 1) v.push([Math.round(dx * k + dz), 0, Math.round(dz * k + dx), 'weed']); } fbox(v, 0, 0, 0, 2, 14, 2, 'weed'); ell(v, 1, 15, 1, 3, 2, 3, 'sun'); return hi(v); } // a dandelion: jagged leaves flat on the soil, a yellow flower


// ---- your room and the kitchen at the new scale (17 Nov 2026): same footprints as before, four times finer ----
function mBookHi(o) { // a book lying flat: a colored cover, cream page edges on three sides, a dark spine with a band, a title
  const v = [], c = o.c || 'book1'; fbox(v, 0, 0, 0, 24, 1, 16, c); fbox(v, 0, 3, 0, 24, 1, 16, c); fbox(v, 1, 1, 1, 22, 2, 14, 'cream'); for (let x = 2; x < 23; x += 3) v.push([x, 1, 15, 'cream2']);
  fbox(v, 0, 0, 0, 3, 4, 16, 'darkwood'); fbox(v, 0, 1, 6, 3, 2, 4, 'sun'); fbox(v, 8, 4, 4, 12, 1, 2, 'white'); fbox(v, 8, 4, 8, 8, 1, 1, 'white'); fbox(v, 10, 4, 11, 6, 1, 3, 'white'); return hi(v);
}
function mBallHi() { const v = []; for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++) { const dx = x - 9.5, dy = y - 9.5, dz = z - 9.5; if (dx * dx + dy * dy + dz * dz > 96) continue; const a = Math.atan2(dz, dx), seg = Math.floor((a + Math.PI) / (Math.PI / 3)); v.push([x, y, z, Math.abs(dy) > 8.2 ? 'white' : ['pink', 'white', 'sky', 'white', 'sun', 'white'][seg % 6]]); } return hi(v); } // a beach ball in stripes
function mToyBoxHi() { // a wooden toy box, open, a star on the front, blocks and a bear inside, room for the ball
  const v = [], W = 56, H = 28, D = 32;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) { if (!(y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2)) continue; v.push([x, y, z, y % 7 === 6 ? 'orange' : 'sun']); }
  fbox(v, 0, H - 2, 0, W, 2, D, 'orange'); fbox(v, 0, H, -3, W, 26, 3, 'teal'); fbox(v, 2, H + 2, -1, W - 4, 22, 1, 'teal2'); fbox(v, 24, 12, D, 8, 4, 2, 'darkwood');
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) if (Math.abs(x) + Math.abs(y) * 0.6 <= 6 || Math.abs(y) + Math.abs(x) * 0.6 <= 6) v.push([28 + x, 14 + y, D, 'pink']); // a star
  fbox(v, 4, 2, 4, 12, 12, 12, 'sky'); fbox(v, 6, 14, 6, 8, 1, 8, 'white'); fbox(v, 40, 2, 6, 12, 16, 12, 'teal'); ell(v, 46, 20, 12, 5, 5, 4, 'crust'); ell(v, 43, 25, 12, 2, 2, 2, 'crust'); ell(v, 49, 25, 12, 2, 2, 2, 'crust'); v.push([45, 21, 16, 'ink'], [47, 21, 16, 'ink']);
  return hi(v);
}
function mStreamHi2(o) { const v = [], h = o.h || 24; fbox(v, 0, 0, 0, 3, h, 3, 'water'); fbox(v, -2, 0, -2, 7, 1, 7, 'water'); v.push([-3, 1, 1, 'water'], [5, 1, 1, 'water'], [1, 1, -3, 'water'], [1, 1, 5, 'water']); return hi(v); }
function hand(v, ox, flip) { // one hand, palm down, fingers along +z (mHandsHi turns them to point into the sink), the thumb toward the other hand
  fbox(v, ox, 0, 0, 22, 6, 20, 'skin'); for (let f = 0; f < 4; f++) { const fx = ox + 1 + f * 5 + (f > 1 ? 1 : 0), len = [13, 16, 15, 11][flip ? f : 3 - f]; fbox(v, fx, 1, 20, 4, 4, len, 'skin'); fbox(v, fx, 4, 20 + len - 3, 4, 1, 3, 'skin3'); }
  fbox(v, flip ? ox - 7 : ox + 22, 1, 6, 7, 4, 5, 'skin'); fbox(v, flip ? ox - 10 : ox + 26, 1, 9, 4, 4, 6, 'skin'); fbox(v, ox + 2, -1, -12, 18, 8, 12, 'sleeve'); fbox(v, ox + 1, -2, -3, 20, 10, 3, 'white');
}
function mHandsHi() { const v = []; hand(v, 0, false); hand(v, 40, true); return hi(v.map(([x, y, z, k]) => [x, y, 20 - z, k])); } // two hands held over the sink, a little apart: sleeves on your side, fingers reaching in under the tap
function mBubblesHi() { const v = []; for (const [x, y, z, r] of [[4, 8, 6, 4], [16, 9, 14, 3.5], [27, 8, 24, 4], [36, 10, 10, 3], [50, 9, 18, 4.5], [58, 8, 30, 3], [10, 11, 28, 3], [44, 11, 4, 3.5], [22, 12, 2, 2.5], [62, 9, 8, 3]]) ell(v, x, y, z, r, r, r, 'bubble'); return hi(v); }
function mSoapHi() { const v = []; ell(v, 7, 9, 7, 7, 10, 7, 'teal'); fbox(v, 0, 0, 0, 15, 2, 15, 'teal2'); fbox(v, 2, 6, 13, 11, 8, 2, 'white'); ell(v, 7.5, 10, 14.5, 3, 2, 0.6, 'sky'); fbox(v, 5, 19, 5, 5, 4, 5, 'white'); fbox(v, 4, 23, 4, 7, 3, 7, 'white'); fbox(v, 6, 24, 11, 3, 2, 8, 'white'); return hi(v); } // a soap pump with a label
function mTowelHi() { const v = []; fbox(v, -2, 42, 2, 36, 2, 2, 'ink'); fbox(v, -3, 36, 0, 2, 8, 6, 'ink'); fbox(v, 33, 36, 0, 2, 8, 6, 'ink'); for (let x = 2; x < 30; x++) for (let y = 0; y < 42; y++) v.push([x, y, 4 + (y > 36 ? 0 : 0), y % 10 < 2 ? 'white' : 'pink']); fbox(v, 2, 0, 5, 28, 2, 1, 'pink2'); return hi(v); } // a towel hanging on a rail
function mCheeseHi() { const v = []; for (let x = 0; x < 20; x++) for (let z = 0; z < 16; z++) { const top = Math.round(16 - x * 0.75); for (let y = 0; y < top; y++) { let hole = false; for (const [hx, hy, hz, r] of [[5, 5, 0, 2.5], [12, 4, 16, 2], [3, 10, 16, 2], [9, 7, 0, 1.6], [0, 6, 8, 2.2]]) if ((x - hx) ** 2 + (y - hy) ** 2 + (z - hz) ** 2 <= r * r) hole = true; if (!hole) v.push([x, y, z, y === top - 1 ? 'cheese' : 'cheese']); } } return hi(v); } // a wedge of cheese with holes
function mBreadHi() { const v = []; for (let x = 0; x < 26; x++) for (let z = 0; z < 16; z++) { const top = 8 + Math.round(4 * Math.sqrt(Math.max(0, 1 - ((z - 7.5) / 8.5) ** 2))); for (let y = 0; y < top; y++) v.push([x, y, z, y >= top - 2 ? ((x + 2) % 7 < 2 ? 'bread' : 'crust') : (x === 0 || x === 25 ? 'bread' : 'crust')]); } return hi(v); } // a loaf with slashes on top
function mMilkHi() { const v = []; fbox(v, 0, 0, 0, 12, 20, 12, 'white'); for (let y = 20; y < 26; y++) fbox(v, 0, y, y - 20, 12, 1, 24 - 2 * (y - 20), 'white'); fbox(v, 0, 26, 5, 12, 3, 2, 'white2'); fbox(v, 0, 6, 12, 12, 7, 1, 'sky'); fbox(v, 3, 8, 13, 6, 3, 1, 'white'); v.push([4, 9, 14, 'ink'], [7, 9, 14, 'ink']); return hi(v); } // a milk carton with a blue band
function mEggHi() { const v = []; for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) { const d = Math.hypot(x - 5.5, z - 5.5); for (let y = 0; y < 6; y++) if (d <= 5.5 - (y < 2 ? 1 : 0) && (y < 2 || d > 4)) v.push([x, y, z, 'wood']); } ell(v, 5.5, 10, 5.5, 4.5, 7, 4.5, 'egg'); return hi(v); } // an egg in an egg cup
function mHoneyHi() { const v = []; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { const d = Math.hypot(x - 7.5, z - 7.5); if (d > 7.6) continue; for (let y = 0; y < 16; y++) v.push([x, y, z, 'honey']); for (let y = 16; y < 20; y++) if (d < 6.5) v.push([x, y, z, 'darkwood']); } fbox(v, 3, 4, 15, 10, 8, 2, 'white'); ell(v, 8, 8, 17, 2.5, 1.6, 0.5, 'sun'); fbox(v, 6, 7, 17, 1, 3, 1, 'ink'); fbox(v, 9, 7, 17, 1, 3, 1, 'ink'); v.push([5, 9, 17, 'white'], [11, 9, 17, 'white']); return hi(v); } // a honey jar, a bee on the label
function mPastaHi() { const v = []; fbox(v, 0, 0, 0, 16, 24, 8, 'sun'); fbox(v, 3, 6, 8, 10, 10, 1, 'glass'); for (const [x, y] of [[4, 8], [7, 11], [10, 8], [5, 13], [9, 14], [11, 11]]) fbox(v, x, y, 7, 2, 1, 1, 'cheese2'); fbox(v, 0, 20, 8, 16, 2, 1, 'pink'); return hi(v); } // a box of dry pasta with a window
function mAppleHi() { const v = []; for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) { const dx = x - 7.5, dy = y - 7.5, dz = z - 7.5, d = dx * dx + dy * dy * 1.1 + dz * dz; if (d <= 60 && !(y > 13 && dx * dx + dz * dz < 6)) v.push([x, y, z, (dx < -3 && dy > 2) ? 'pink' : 'apple']); } fbox(v, 7, 14, 7, 2, 5, 2, 'darkwood'); ell(v, 11, 17, 8, 3, 1, 2, 'leaf'); return hi(v); } // an apple with a stem and a leaf
function mCarrotHi() { const v = []; for (let x = 0; x < 28; x++) { const r = 4.5 * (1 - x / 30); for (let y = -5; y <= 5; y++) for (let z = -5; z <= 5; z++) if (y * y + z * z <= r * r) v.push([x, y + 5, z + 5, x % 5 === 2 && y * y + z * z > (r - 1) * (r - 1) ? 'orange2' : 'orange']); } for (const [dy, dz] of [[0, 0], [3, 2], [-2, 3], [2, -3]]) for (let k = 0; k < 10; k++) v.push([-1 - k, 5 + dy + Math.round(k * 0.6), 5 + dz, 'leaf']); return hi(v); } // a carrot with its green top
function mBasketHi(o) { // a woven basket with a handle and a picture sign: a leaf for plants, a cow for animals
  const v = [], W = 48, D = 40, H = 20;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) { if (!(y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2)) continue; v.push([x, y, z, ((x >> 2) + (y >> 2) + (z >> 2)) % 2 ? 'wood' : 'crust']); }
  for (let a = 0; a <= 32; a++) { const t = Math.PI * a / 32; fbox(v, Math.round(24 - Math.cos(t) * 22), H + Math.round(Math.sin(t) * 14), 19, 2, 2, 2, 'darkwood'); }
  fbox(v, 8, H - 2, D, 32, 26, 2, 'white'); fbox(v, 7, H - 3, D + 1, 34, 1, 1, 'ink'); fbox(v, 7, H + 23, D + 1, 34, 1, 1, 'ink');
  if (o.kind === 'plant') { fbox(v, 23, H + 1, D + 2, 2, 12, 1, 'leaf2'); ell(v, 18, H + 12, D + 2, 6, 3.5, 0.5, 'leaf'); ell(v, 30, H + 15, D + 2, 6, 3.5, 0.5, 'leaf'); ell(v, 24, H + 19, D + 2, 3.5, 2.5, 0.5, 'leaf3'); }
  else { ell(v, 24, H + 9, D + 2, 11, 6, 0.5, 'white'); for (const [x, y] of [[19, 10], [27, 7], [30, 12]]) ell(v, x, H + y, D + 3, 2.5, 2, 0.4, 'ink'); fbox(v, 14, H + 1, D + 2, 2, 4, 1, 'ink'); fbox(v, 31, H + 1, D + 2, 2, 4, 1, 'ink'); ell(v, 36, H + 13, D + 2, 5, 4, 0.5, 'white'); ell(v, 39, H + 12, D + 3, 2.5, 2, 0.4, 'pink'); v.push([35, H + 15, D + 3, 'ink'], [33, H + 17, D + 2, 'crust'], [38, H + 17, D + 2, 'crust']); }
  return hi(v);
}
function mPlateHi() { const v = []; for (let x = 0; x < 40; x++) for (let z = 0; z < 32; z++) { const e = ((x - 19.5) / 20) ** 2 + ((z - 15.5) / 16) ** 2; if (e <= 1) { v.push([x, 0, z, e > 0.72 ? 'white2' : e > 0.5 && e < 0.58 ? 'sky' : 'white']); if (e > 0.8) v.push([x, 1, z, e > 0.9 ? 'sky' : 'white']); } } return hi(v); } // a plate with a blue rim
function mPlatesHi() { const v = []; for (let y = 0; y < 3; y++) for (const [x, , z, k] of mPlateHi()) v.push([x, y * 2 + (k === 'sky' ? 1 : 0), z, k]); v.res = 32; return v; }
function mBreadBagHi() { const v = []; for (const [x, y, z, k] of mBreadHi()) v.push([x + 2, y, z + 2, k]); for (let x = 0; x < 30; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 20; z++) if ((x === 0 || x === 29 || y === 15 || z === 0 || z === 19) && x < 30) v.push([x, y, z, 'glass']); fbox(v, 30, 4, 7, 6, 6, 6, 'bag'); fbox(v, 30, 6, 8, 2, 2, 4, 'sun'); v.res = 32; return v; } // a loaf in a clear bag with a tie
function mSliceHi() { const v = []; for (let x = 0; x < 28; x++) for (let z = 0; z < 24; z++) { const top = z > 18 ? Math.hypot(x - 14, (z - 18) * 1.6) <= 14 : true; if (!top) continue; const edge = x < 2 || x > 25 || z < 2 || (z > 18 && Math.hypot(x - 14, (z - 18) * 1.6) > 12); v.push([x, 0, z, edge ? 'crust' : 'bread'], [x, 1, z, edge ? 'crust' : ((x * 7 + z * 3) % 11 === 0 ? 'cream2' : 'bread')]); } return hi(v); } // a slice of bread, crust all round
function mButterHi() { const v = []; for (let x = 0; x < 28; x++) for (let z = 0; z < 20; z++) v.push([x, 0, z, 'white']); fbox(v, 0, 1, 0, 28, 2, 1, 'white'); fbox(v, 0, 1, 19, 28, 2, 1, 'white'); fbox(v, 4, 1, 5, 16, 8, 10, 'butter'); fbox(v, 4, 9, 5, 9, 1, 10, 'butter'); fbox(v, 14, 3, 9, 20, 1, 3, 'stone'); fbox(v, 26, 3, 8, 10, 2, 5, 'wood'); return hi(v); } // a butter dish with a butter knife (not sharp)
function mLayerHi(o) { const v = []; for (let x = 0; x < 28; x++) for (let z = 0; z < 24; z++) { if (o.wavy) { const out = (x + z) % 6 < 2 && (x < 2 || x > 25 || z < 2 || z > 21); if (out) continue; v.push([x, (x * 3 + z) % 9 === 0 ? 1 : 0, z, (x + z) % 5 ? o.c : 'leaf']); } else { if (o.c === 'butter' && (x < 2 || x > 25 || z < 2 || z > 21)) continue; v.push([x, 0, z, o.c]); if (o.c === 'cheese' && z > 21) v.push([x, -1, z, 'cheese2']); } } return hi(v); }
function mLettuceHi() { const v = []; for (let x = 0; x < 22; x++) for (let y = 0; y < 18; y++) for (let z = 0; z < 22; z++) { const dx = x - 10.5, dy = y - 8, dz = z - 10.5, d = dx * dx + dy * dy * 1.3 + dz * dz; if (d > 110) continue; const ring = Math.floor(Math.sqrt(d) / 2.5); v.push([x, y, z, ring % 2 ? 'leaf3' : (y > 13 ? 'leaf3' : 'leaf')]); } return hi(v); } // a round head of lettuce, leaf on leaf
function mCheeseSlicesHi() { const v = []; for (let y = 0; y < 6; y++) for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) { const sx = x + (y % 2) * 2 - 1, sz = z + (y % 2) - 1; if (sx < 0 || sx > 22 || sz < 0 || sz > 22) continue; v.push([x, y, z, y % 2 ? 'cheese2' : 'cheese']); } return hi(v); } // a stack of cheese slices


// ---- the workshop and the market at the new scale (17 Nov 2026) ----
function mGogglesHi() { // safety glasses standing on the bench: two clear lenses in a frame, side shields, a strap
  const v = []; for (const ox of [0, 15]) { fbox(v, ox, 0, 0, 13, 10, 2, 'ink'); fbox(v, ox + 1, 1, 0, 11, 8, 2, 'glass'); fbox(v, ox + 1, 7, 2, 11, 1, 1, 'white'); }
  fbox(v, 13, 6, 0, 2, 3, 2, 'ink'); fbox(v, -2, 2, -6, 2, 7, 8, 'teal'); fbox(v, 28, 2, -6, 2, 7, 8, 'teal'); fbox(v, -2, 4, -14, 32, 2, 2, 'sun'); fbox(v, -2, 4, -14, 2, 2, 8, 'sun'); fbox(v, 28, 4, -14, 2, 2, 8, 'sun');
  return hi(v);
}
function mHammerHi() { const v = []; fbox(v, 0, 0, 0, 5, 5, 26, 'wood'); fbox(v, 0, 0, 0, 5, 5, 9, 'pink'); for (let z = 1; z < 9; z += 2) fbox(v, 0, 5, z, 5, 1, 1, 'pink2'); fbox(v, -5, -1, 26, 15, 7, 6, 'stone'); fbox(v, -8, 0, 27, 3, 5, 4, 'stone2'); fbox(v, 10, 0, 27, 3, 5, 2, 'stone2'); fbox(v, 12, 0, 25, 2, 5, 2, 'stone2'); return hi(v); } // a hammer: a grip, a handle, a head with a claw
function mScrewdriverHi() { const v = []; fbox(v, 0, 0, 0, 6, 6, 14, 'teal'); for (let z = 1; z < 13; z += 3) { fbox(v, -1, 2, z, 1, 2, 2, 'teal2'); fbox(v, 6, 2, z, 1, 2, 2, 'teal2'); fbox(v, 2, 6, z, 2, 1, 2, 'teal2'); } fbox(v, 2, 2, 14, 2, 2, 14, 'stone'); fbox(v, 1, 2, 28, 4, 2, 2, 'stone2'); return hi(v); } // a screwdriver: a ridged handle, a long shaft, a flat tip
function mWrenchHi() { const v = []; fbox(v, 0, 0, 6, 5, 2, 20, 'stone'); for (let x = -4; x <= 8; x++) for (let z = -2; z <= 8; z++) { const d = Math.hypot(x - 2, z - 2.5); if (d <= 6 && !(x >= 0 && x <= 4 && z < 3)) v.push([x, 0, z, 'stone']); } for (let x = -4; x <= 8; x++) for (let z = 24; z <= 34; z++) { const d = Math.hypot(x - 2, z - 29); if (d <= 5.5 && d > 2.5) v.push([x, 0, z, 'stone']); } fbox(v, 1, 2, 10, 3, 1, 10, 'stone2'); return hi(v); } // a wrench: an open jaw and a ring
function mTapeHi() { const v = []; for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d <= 8) for (let z = 0; z < 7; z++) v.push([x, y, z, d > 6.6 || z === 0 || z === 6 ? 'sun' : 'orange']); } ell(v, 7.5, 7.5, 7, 3, 3, 0.6, 'ink'); fbox(v, 16, 0, 1, 16, 1, 5, 'white'); for (let x = 17; x < 32; x += 3) fbox(v, x, 1, 1, 1, 1, x % 6 === 2 ? 4 : 2, 'ink'); fbox(v, 31, 0, 0, 2, 3, 7, 'stone'); return hi(v); } // a tape measure with its tape pulled out, marks on it
function mChairHi() { const v = []; for (const [x, z] of [[0, 0], [28, 0], [0, 28], [28, 28]]) fbox(v, x, 0, z, 4, 24, 4, 'darkwood'); fbox(v, 2, 8, 2, 28, 2, 2, 'darkwood'); fbox(v, 0, 24, 0, 32, 4, 32, 'teal'); fbox(v, 1, 28, 1, 30, 1, 30, 'teal2'); fbox(v, 0, 28, 28, 4, 28, 4, 'darkwood'); fbox(v, 28, 28, 28, 4, 28, 4, 'darkwood'); for (const y of [36, 44, 52]) fbox(v, 4, y, 29, 24, 4, 2, 'teal'); return hi(v); } // a wooden chair with a teal seat and a slatted back
function mNailUpHi() { const v = []; fbox(v, 0, 0, 0, 2, 12, 2, 'stone'); for (let x = -2; x <= 3; x++) for (let z = -2; z <= 3; z++) if (Math.hypot(x - 0.5, z - 0.5) <= 3) v.push([x, 12, z, 'stone2']); return hi(v); } // a nail sticking up
function mNailDownHi() { const v = []; for (let x = -2; x <= 3; x++) for (let z = -2; z <= 3; z++) if (Math.hypot(x - 0.5, z - 0.5) <= 3) v.push([x, 0, z, 'stone2']); return hi(v); } // the nail, hammered down flat
function mMarkHi() { const v = []; fbox(v, 0, 0, 0, 2, 1, 20, 'ink'); fbox(v, -3, 0, 22, 8, 1, 2, 'ink'); return hi(v); } // a pencil line across the board
function mBreadMkt() { return mBreadHi(); }
function mApplesHi() { const v = []; for (const [cx, cz] of [[6, 6], [16, 6], [11, 14]]) ell(v, cx, 6, cz, 5.5, 5.5, 5.5, 'apple'); for (const [cx, cz] of [[6, 6], [16, 6], [11, 14]]) { fbox(v, cx, 11, cz, 1, 3, 1, 'darkwood'); v.push([cx + 1, 13, cz, 'leaf']); } for (let x = 0; x < 22; x += 3) for (let y = 0; y < 10; y += 3) { v.push([x, y, 0, 'bag2'], [x, y, 20, 'bag2']); } for (let z = 0; z < 21; z += 3) for (let y = 0; y < 10; y += 3) { v.push([0, y, z, 'bag2'], [21, y, z, 'bag2']); } fbox(v, 9, 10, 0, 4, 3, 1, 'sun'); return hi(v); } // three apples in a net bag with a tag
function mShopBasketHi() { const v = [], W = 48, D = 40, H = 20; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) { if (!(y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2)) continue; const hole = y > 3 && y < H - 3 && (x % 6 === 3 || z % 6 === 3) && !(x < 2 && z < 2); v.push([x, y, z, hole ? 'teal2' : 'sky']); } fbox(v, 0, H - 2, 0, W, 2, D, 'teal'); for (const x of [4, 42]) { fbox(v, x, H, 18, 2, 12, 4, 'ink'); } fbox(v, 4, H + 12, 18, 40, 2, 4, 'ink'); return hi(v); } // a shopping basket with a handle
function mRegisterHi() { const v = []; fbox(v, 0, 0, 0, 24, 10, 22, 'ink'); fbox(v, 0, 0, 22, 24, 6, 6, 'stone'); fbox(v, 10, 2, 28, 4, 2, 1, 'sun'); for (let x = 3; x < 21; x += 4) for (let z = 4; z < 18; z += 4) fbox(v, x, 10, z, 3, 1, 3, (x + z) % 3 ? 'white' : 'sun'); fbox(v, 2, 10, 0, 20, 14, 3, 'ink'); fbox(v, 4, 13, 3, 16, 8, 1, 'teal'); fbox(v, 7, 15, 4, 2, 4, 1, 'white'); fbox(v, 11, 15, 4, 2, 4, 1, 'white'); fbox(v, 15, 15, 4, 2, 4, 1, 'white'); return hi(v); } // a cash register: keys, a screen, a drawer
function digit(v, d, x0, y, z0) { const P = { 1: ['010', '110', '010', '010', '111'], 0: ['111', '101', '101', '101', '111'] }[d]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (P[r][c] === '1') v.push([x0 + c, y, z0 + r, 'money2']); }
function mBillHi() { const v = []; fbox(v, 0, 0, 0, 30, 1, 14, 'money'); for (let x = 0; x < 30; x++) { v.push([x, 1, 0, 'money2'], [x, 1, 13, 'money2']); } for (let z = 0; z < 14; z++) { v.push([0, 1, z, 'money2'], [29, 1, z, 'money2']); } ell(v, 15, 1, 7, 4, 0.4, 4.5, 'money2'); ell(v, 15, 1, 7, 2.5, 0.4, 3, 'money'); digit(v, 1, 2, 1, 2); digit(v, 0, 6, 1, 2); digit(v, 1, 21, 1, 7); digit(v, 0, 25, 1, 7); return hi(v); } // a 10-dollar bill, 10 in two corners


// ---- the fire station and the library at the new scale (17 Nov 2026): pictures drawn as clear 12 by 12 pixel pictures ----
function iconData() { const PAL = { k: 'ink', w: 'white', r: 'firered', o: 'orange', y: 'sun', s: 'skin', b: 'sky', t: 'teal', p: 'pink', g: 'leaf', d: 'darkwood', c: 'cream', n: 'wood', h: 'hair', m: 'stone', l: 'leaf3', e: 'egg' };
const ICON = {
  fire: ['..r....o....', '.oyo..oyo...', '.oyyo.oyyo..', '..oo....o...', '....kkkk....', '...kccccck..', '..kccccccck.', '.kkkkkkkkkkk', '..cooccooc..', '..cooccooc..', '..cccdddcc..', '..cccdddcc..'],
  hurt: ['....rr......', '...rrrr.....', '....rr......', '............', '............', '.hh.........', 'hssh........', 'hssbbbbbbss.', '.ss.bbbbb.ss', '....kkkkkk..', '............', 'cccccccccccc'],
  toy: ['..nn....nn..', '.nddn..nddn.', '..nnnnnnnn..', '.nnknnnnknn.', '.nnnnddnnnn.', '.nnnnkknnnn.', '..nnnnnnnn..', '.nnnddddnnn.', 'nnnddddddnnn', 'nnnddddddnnn', '.nnnnnnnnnn.', '.nnn....nnn.'],
  puzzle: ['.tttt..yyyy.', '.tttttyyyyy.', 'ttttt.yyyyyy', 'ttttt.yyyyyy', '.ttttyyyyy..', '.tttt..yyyy.', '.pppp..bbbb.', '.pppppbbbbb.', 'ppppp.bbbbbb', 'ppppp.bbbbbb', '.ppppbbbbb..', '.pppp..bbbb.'],
  phone: ['............', '...kkkkkk...', '..kwwwwwwk..', '..kwbbbbwk..', '..kwbbbbwk..', '..kwwwwwwk..', '..kwkwkwwk..', '..kwwwwwwk..', '..kwkwkwwk..', '..kwwwwwwk..', '...kkkkkk...', '............'],
  house: ['.....pp.....', '....pppp....', '...pppppp...', '..pppppppp..', '.pppppppppp.', '..yyyyyyyy..', '..ybbyyyyy..', '..ybbyddyy..', '..yyyyddyy..', '..yyyyddyy..', '..yyyyddyy..', 'gggggggggggg'],
  spider: ['k....kk....k', '.k..kkkk..k.', '..kkkkkkkk..', 'k..kwkkwk..k', '.kkkkkkkkkk.', '...kkkkkk...', '.kkkkkkkkkk.', 'k..kkkkkk..k', '..k.kkkk.k..', '.k..k..k..k.', 'k..k....k..k', '............'],
  sun: ['.....y......', '..y..y..y...', '...yyyyy....', '..yyyyyyy...', 'yyyyyyyyyyy.', '..yyyyyyy...', '...yyyyy....', '..y..y..y...', '.....y......', '..........w.', '........w.ww', '.........w..'],
  penguin: ['....kkkk....', '...kkkkkk...', '...kwkkwk...', '...kkookk...', '..kkwwwwkk..', '.kkwwwwwwkk.', '.kkwwwwwwkk.', '.kkwwwwwwkk.', '..kwwwwwwk..', '...kwwwwk...', '...oo..oo...', 'bbbbbbbbbbbb'],
  bat: ['............', 'k....kk....k', 'kk..kkkk..kk', 'kkk.kwwk.kkk', 'kkkkkkkkkkkk', 'kkkkkkkkkkkk', '.kkkkkkkkkk.', '.kk.kkkk.kk.', '.k...kk...k.', '............', '............', '............'],
  bug: ['...k....k...', '....k..k....', '....kkkk....', '...rrkkrr...', '..rrkrrkrr..', '..rrrkkrrr..', '..rkrrkrkr..', '..rrrrkrrr..', '..rkrkkrkr..', '...rrkkrr...', '....r..r....', '............'],
  space: ['..w.......w.', '.....yy.....', '....yyyy....', '...yyyyyy..w', '..oooooooo..', '.o.yyyyyy.o.', '..oooooooo..', '...yyyyyy...', '....yyyy....', 'w....yy.....', '..........w.', '...w........'],
  bird: ['............', '.......bb...', '......bbbb..', '......bkbbo.', '..bbbbbbbbo.', '.bbbbbbbb...', 'bbbbwwwbb...', '.bbbwwwbb...', '..bbbbbb....', '....o..o....', '...oo.oo....', 'nnnnnnnnnnnn'],
  animal: ['.o......o...', '.oo....oo...', '.ooooooooo..', 'oowkooowkoo.', 'ooooooooooo.', '.ooowkkwooo.', '..oowwwwoo..', '...oooooo..o', '..oooooooooo', '..oooooooo..', '..oo....oo..', '..oo....oo..'],
  story: ['............', '.pppp..bbbb.', 'pwwwwppwwwwb', 'pwkkwppwkkwb', 'pwwwwppwwwwb', 'pwkkwppwkkwb', 'pwwwwppwwwwb', 'pwkkwppwkkwb', 'pwwwwppwwwwb', '.pppppbbbbb.', '......d.....', '............'],
  color: ['..pppp......', '.pppppp.....', '.ppppppbbbb.', '..pppbbbbbb.', '....bbbbbb..', '...yyyybb...', '..yyyyyy....', '..yyyyyggg..', '...yyyggggg.', '.....ggggg..', '......ggg...', '............'],
  pet: ['............', '.dd......dd.', '.ddnnnnnndd.', '..nnnnnnnn..', '..nknnnnkn..', '..nnnnnnnn..', '...nnkknn...', '...nnppnn...', '..nnnnnnnn..', '.nnnnnnnnnn.', '.nnn.nn.nnn.', '.nn..nn..nn.'],
  lock: ['....kkkk....', '...k....k...', '..k......k..', '..k......k..', '..k......k..', '.yyyyyyyyyy.', '.yyyyyyyyyy.', '.yyyykkyyyy.', '.yyyykkyyyy.', '.yyyyykyyyy.', '.yyyyyyyyyy.', '.yyyyyyyyyy.'],
  check: ['............', '..........gg', '.........ggg', '........ggg.', '.......ggg..', 'gg....ggg...', 'ggg..ggg....', '.ggggggg....', '..ggggg.....', '...ggg......', '....g.......', '............'],
  sell: ['....yyyy....', '..yyyyyyyy..', '.yyykkkkyyy.', '.yyky..yyyy.', '.yyykkkyyyy.', '.yyyyy.kyyy.', '.yyykkkkyyy.', '..yyykyyyy..', '....yyyy....', '............', 'pppppppppppp', '.p.p.p.p.p.p'],
};
  return { PAL, ICON }; }
function picXY(v, name, x0, y0, z, px) { const { PAL, ICON } = iconData(), g = ICON[name]; for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) { const ch = g[r][c]; if (ch !== '.') fbox(v, x0 + c * px, y0 + (11 - r) * px, z, px, px, 1, PAL[ch]); } } // a picture standing up (rows go down)
function picXZ(v, name, x0, y, z0, px) { const { PAL, ICON } = iconData(), g = ICON[name]; for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) { const ch = g[r][c]; if (ch !== '.') fbox(v, x0 + c * px, y, z0 + r * px, px, 1, px, PAL[ch]); } } // a picture lying flat (rows go toward you)
function mCardHi(o) { const v = []; fbox(v, 0, 0, 0, 28, 30, 2, 'white'); fbox(v, 0, 0, 0, 28, 1, 2, 'ink'); fbox(v, 0, 29, 0, 28, 1, 2, 'ink'); fbox(v, 0, 0, 0, 1, 30, 2, 'ink'); fbox(v, 27, 0, 0, 1, 30, 2, 'ink'); picXY(v, o.pic, 2, 3, 2, 2); fbox(v, 6, -2, -6, 16, 2, 8, 'wood'); return hi(v); } // a picture card standing on a little wooden foot
function mBinHi(o) { const v = [], red = o.kind === 'call', W = 48, D = 40, H = 22; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2) v.push([x, y, z, red ? (y % 6 === 5 ? 'pink2' : 'firered') : (y % 6 === 5 ? 'teal2' : 'teal')]); fbox(v, 8, H - 2, D, 32, 30, 2, 'white'); fbox(v, 8, H - 2, D, 32, 1, 3, 'ink'); picXY(v, red ? 'phone' : 'house', 12, H + 1, D + 2, 2); return hi(v); } // a bin with a picture sign: a phone for Call 9-1-1, a house for Ask a grown-up
function mKeyHi(o) { const v = []; fbox(v, 0, 0, 0, 8, 8, 3, 'sun'); fbox(v, 0, 0, 0, 8, 1, 3, 'orange'); const D = { 9: ['111', '101', '111', '001', '111'], 1: ['010', '110', '010', '010', '111'] }[o.n]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (D[r][c] === '1') v.push([2 + c, 6 - r, 3, 'ink']); return hi(v); } // a big 9 or 1 key, sun yellow
function mPhoneBigHi() { const v = []; fbox(v, 0, 0, 0, 44, 68, 6, 'ink'); fbox(v, 4, 52, 6, 36, 12, 1, 'mirror'); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const x = 4 + c * 12, y = 40 - r * 12; fbox(v, x, y, 6, 8, 8, 2, (r === 0 && c === 0) || (r === 2 && c === 2) ? 'stone' : 'white'); } fbox(v, 4, 0, 6, 8, 2, 1, 'firered'); fbox(v, 32, 0, 6, 8, 2, 1, 'leaf'); return hi(v); } // a big pretend phone, keys to press
function mAlarmHi() { const v = []; for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { const d = Math.hypot(x - 7.5, z - 7.5); if (d <= 8) { v.push([x, 0, z, 'white'], [x, 1, z, d > 6.5 ? 'white2' : 'white']); if (d < 6 && (x + z) % 3 === 0) v.push([x, -1, z, 'stone']); } } fbox(v, 7, -2, 7, 2, 1, 2, 'firered'); return hi(v); } // a round smoke alarm with a red light
function mSmokeHi() { const v = []; for (const [x, y, r] of [[8, 6, 6], [20, 9, 7], [32, 6, 6], [14, 16, 5], [27, 18, 5], [42, 12, 5]]) ell(v, x, y, 3, r, r * 0.8, 3, 'smoke'); return hi(v); } // grey smoke, high up
function mDoorHi() { const v = []; fbox(v, -2, 0, 0, 32, 62, 3, 'white'); fbox(v, 0, 0, 1, 28, 60, 3, 'darkwood'); for (const [y, h] of [[6, 22], [34, 22]]) { fbox(v, 3, y, 4, 9, h, 1, 'wood'); fbox(v, 16, y, 4, 9, h, 1, 'wood'); } ell(v, 23, 30, 4.5, 2, 2, 1, 'sun'); fbox(v, 10, 64, 1, 8, 3, 1, 'leaf'); return hi(v); } // a door with panels, a knob and a green exit sign
function mTreeHi() { const v = []; fbox(v, 0, 0, 0, 6, 26, 6, 'darkwood'); fbox(v, -2, 0, -2, 10, 3, 10, 'darkwood'); ell(v, 3, 36, 3, 16, 13, 16, 'leaf'); ell(v, -6, 32, 6, 8, 7, 8, 'leaf2'); ell(v, 10, 40, -2, 8, 7, 8, 'leaf3'); for (const [x, y, z] of [[-8, 30, 18], [12, 34, 16], [2, 44, 17], [16, 28, 8]]) ell(v, x, y, z, 1.6, 1.6, 1.6, 'apple'); return hi(v); } // a big apple tree: the family meeting place
function mClaimHi(o) { const v = []; fbox(v, 0, 0, 0, 30, 2, 30, 'white'); for (let i = 0; i < 30; i++) { v.push([i, 2, 0, 'ink'], [i, 2, 29, 'ink'], [0, 2, i, 'ink'], [29, 2, i, 'ink']); } picXZ(v, o.pic, 3, 2, 3, 2); return hi(v); } // a claim card lying on the rug: a picture of what someone said
function mBigBookHi(o) { const v = [], c = o.c || 'teal'; fbox(v, 0, 0, 0, 30, 34, 8, c); fbox(v, 0, 0, 0, 4, 34, 8, 'darkwood'); fbox(v, 4, 1, 1, 25, 32, 6, 'cream'); fbox(v, 4, 0, 0, 26, 34, 1, c); fbox(v, 4, 0, 7, 26, 34, 1, c); fbox(v, 3, 3, 8, 26, 26, 1, 'white'); picXY(v, o.pic, 4, 4, 9, 2); return hi(v); } // a big topic book standing up, its cover picture showing what it is about
function mCerealHi() { const v = []; fbox(v, 0, 0, 0, 20, 30, 8, 'firered'); fbox(v, 2, 22, 8, 16, 6, 1, 'sun'); for (let x = 3; x < 17; x += 3) fbox(v, x, 23, 9, 2, 4, 1, 'firered'); ell(v, 10, 12, 8.5, 7, 6, 0.6, 'white'); for (const [x, y] of [[7, 13], [11, 11], [13, 14], [9, 9]]) ell(v, x, y, 9, 1.4, 1.4, 0.6, 'sun'); fbox(v, 14, 2, 8, 5, 5, 1, 'sky'); v.push([15, 4, 9, 'white'], [17, 4, 9, 'white']); return hi(v); } // a cereal box, bright and loud, a big star sticker on it
function mTvAdHi() { const v = []; fbox(v, 0, 0, 0, 30, 24, 6, 'ink'); fbox(v, 2, 3, 6, 26, 18, 1, 'sky'); for (const [x, y] of [[8, 8], [9, 8], [8, 9], [9, 9], [10, 10], [7, 10]]) fbox(v, x, y, 7, 1, 1, 1, 'sun'); ell(v, 18, 12, 7, 4, 4, 0.6, 'pink'); fbox(v, 16, 6, 7, 5, 2, 1, 'ink'); for (const [x, y] of [[4, 17], [24, 17], [24, 5], [4, 5]]) fbox(v, x, y, 7, 2, 2, 1, 'sun'); fbox(v, 8, -6, 2, 2, 6, 2, 'ink'); fbox(v, 20, -6, 2, 2, 6, 2, 'ink'); return hi(v); } // a TV showing a toy advert with stars
function mStoryBookHi() { const v = []; fbox(v, 0, 0, 0, 26, 2, 22, 'pink'); fbox(v, 1, 2, 1, 24, 2, 20, 'white'); fbox(v, 12, 2, 0, 2, 3, 22, 'pink2'); for (let z = 3; z < 19; z += 3) { fbox(v, 3, 4, z, 7, 1, 1, 'stone'); } ell(v, 19, 4, 8, 3.5, 0.5, 3, 'leaf'); fbox(v, 18, 4, 12, 2, 1, 4, 'darkwood'); ell(v, 19, 4.5, 16, 2, 0.5, 1.5, 'sun'); return hi(v); } // an open storybook: words and a picture of a tree
function mAtlasHi() { const v = []; fbox(v, 0, 0, 0, 26, 2, 22, 'sky'); fbox(v, 1, 2, 1, 24, 2, 20, 'white'); fbox(v, 12, 2, 0, 2, 3, 22, 'teal2'); for (const [x, z, rx, rz] of [[6, 8, 4, 3], [5, 15, 2.5, 3], [19, 7, 4, 2.5], [20, 15, 3, 3.5]]) ell(v, x, 4, z, rx, 0.5, rz, 'leaf'); for (let x = 2; x < 24; x += 4) v.push([x, 4, 2, 'sky'], [x + 1, 4, 19, 'sky']); return hi(v); } // an open book of maps
function mBin2Hi(o) { const v = [], sell = o.kind === 'sell', W = 48, D = 40, H = 20; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2) v.push([x, y, z, sell ? (y % 5 === 4 ? 'pink2' : 'pink') : (y % 5 === 4 ? 'teal2' : 'teal')]); fbox(v, 8, H - 2, D, 32, 30, 2, 'white'); picXY(v, sell ? 'sell' : 'story', 12, H + 1, D + 2, 2); return hi(v); } // a bin with a sign: a price tag for Trying to sell, an open book for Telling or teaching


// ---- the post office and the park at the new scale (17 Nov 2026) ----
function mPaperHi() { const v = []; fbox(v, 0, 0, 0, 24, 1, 30, 'white'); for (let z = 6; z < 28; z += 4) fbox(v, 2, 1, z, 20, 1, 1, 'sky2'); fbox(v, 3, 1, 1, 1, 1, 28, 'pink'); return hi(v); } // a sheet of lined paper
function mWritingHi() { const v = []; const W = [[3, 4, 6], [10, 4, 7], [3, 8, 9], [13, 8, 6], [3, 12, 5], [9, 12, 10], [3, 16, 8], [12, 16, 5], [3, 20, 11]]; for (const [x, z, w] of W) fbox(v, x + 2, 0, z + 2, w, 1, 1, 'ink'); for (const [x, z] of [[17, 22], [19, 22], [16, 23], [17, 23], [18, 23], [19, 23], [20, 23], [17, 24], [18, 24], [19, 24], [18, 25]]) v.push([x, 0, z, 'pink']); return hi(v); } // a note written on it, signed with a heart
function mPencilHi() { const v = []; fbox(v, 0, 0, 0, 4, 4, 26, 'sun'); fbox(v, 0, 3, 0, 4, 1, 26, 'orange'); fbox(v, 0, 0, 26, 4, 4, 2, 'stone'); fbox(v, 0, 0, 28, 4, 4, 4, 'pink'); for (let i = 0; i < 6; i++) { const w = Math.max(1, 4 - Math.floor(i * 0.7)); fbox(v, 2 - Math.ceil(w / 2), 2 - Math.ceil(w / 2), -1 - i, w, w, 1, i > 3 ? 'ink' : 'cream2'); } return hi(v); } // a sharpened pencil with an eraser
function mEnvelopeHi(o) { const v = []; fbox(v, 0, 0, 0, 32, 2, 22, 'cream'); for (let i = 0; i < 11; i++) { fbox(v, i, 2, i, 32 - 2 * i, 1, 1, 'cream2'); } if (!o.closed) for (let i = 0; i < 11; i++) fbox(v, i, 2, -1 - i, 32 - 2 * i, 1, 1, 'cream2'); return hi(v); } // an envelope: open with its flap up, or closed
function mAddressHi() { const v = []; for (const [z, w] of [[12, 14], [15, 12], [18, 10]]) fbox(v, 9, 0, z, w, 1, 1, 'ink'); for (const [z, w] of [[2, 6], [4, 5]]) fbox(v, 2, 0, z, w, 1, 1, 'stone'); return hi(v); } // the address in the middle, the return address top left
function mStampOnHi() { const v = []; fbox(v, 24, 0, 1, 7, 1, 8, 'sky'); for (let i = 0; i < 8; i += 2) { v.push([24, 1, 1 + i, 'white'], [30, 1, 1 + i, 'white']); } ell(v, 27.5, 1, 5, 1.6, 0.4, 1.6, 'pink'); return hi(v); } // the stamp in the top right corner
function mStampsHi() { const v = []; for (const [x, z] of [[0, 0], [10, 0], [0, 12], [10, 12]]) { fbox(v, x, 0, z, 9, 1, 11, 'white'); fbox(v, x + 1, 1, z + 1, 7, 1, 9, 'sky'); ell(v, x + 4.5, 1, z + 5, 2, 0.4, 2, 'pink'); fbox(v, x + 4, 1, z + 7, 1, 1, 3, 'leaf'); } return hi(v); } // a sheet of four flower stamps
function mShareCardHi(o) { const v = []; fbox(v, 0, 0, 0, 30, 2, 30, 'white'); for (let i = 0; i < 30; i++) { v.push([i, 2, 0, 'ink'], [i, 2, 29, 'ink'], [0, 2, i, 'ink'], [29, 2, i, 'ink']); } picXZ(v, { color: 'color', pet: 'pet', home: 'house', lock: 'lock' }[o.pic], 3, 2, 3, 2); return hi(v); } // a card: your favorite color, your pet, your home, a password
function mBinOkHi() { const v = [], W = 48, D = 40, H = 22; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === 0 || x < 2 || x >= W - 2 || z < 2 || z >= D - 2) v.push([x, y, z, y % 6 === 5 ? 'leaf2' : 'leaf']); fbox(v, 8, H - 2, D, 32, 30, 2, 'white'); picXY(v, 'check', 12, H + 1, D + 2, 2); return hi(v); } // a green bin with a check: OK to share
function mRobinHi() { const v = []; ell(v, 10, 9, 6, 8, 6, 5, 'darkwood'); ell(v, 13, 8, 6, 5, 5, 4.6, 'firered'); ell(v, 16, 15, 6, 4.5, 4.5, 4, 'darkwood'); fbox(v, 20, 14, 5, 4, 2, 2, 'sun'); v.push([18, 16, 9, 'ink'], [18, 16, 2, 'ink'], [19, 17, 9, 'white']); fbox(v, -4, 9, 4, 6, 2, 4, 'darkwood'); fbox(v, 8, 0, 5, 1, 4, 1, 'orange'); fbox(v, 12, 0, 5, 1, 4, 1, 'orange'); return hi(v); } // a robin: a brown back, a red breast, a yellow beak
function mSquirrelHi() { const v = []; ell(v, 10, 9, 6, 6, 8, 5, 'crust'); ell(v, 12, 9, 7, 3.5, 6, 3, 'cream'); ell(v, 13, 19, 6, 4.5, 4, 4, 'crust'); fbox(v, 12, 23, 4, 2, 3, 2, 'crust'); fbox(v, 12, 23, 8, 2, 3, 2, 'crust'); v.push([16, 20, 9, 'ink'], [16, 20, 3, 'ink'], [18, 18, 6, 'ink']); for (let k = 0; k < 18; k++) { const a = k * 0.32; ell(v, 3 - Math.sin(a) * 5, 4 + k * 1.3, 6, 3.5, 2.5, 3.5, 'crust'); } ell(v, 16, 11, 6, 2, 2, 2, 'darkwood'); return hi(v); } // a squirrel with a bushy tail, holding a nut
function mBeeHi() { const v = []; for (let x = 0; x < 14; x++) for (let y = 0; y < 10; y++) for (let z = 0; z < 10; z++) { const e = ((x - 6.5) / 7) ** 2 + ((y - 4.5) / 5) ** 2 + ((z - 4.5) / 5) ** 2; if (e <= 1) v.push([x, y, z, x % 4 < 2 && x > 1 ? 'ink' : 'sun']); } ell(v, 4, 11, 1, 3, 1, 4, 'glass'); ell(v, 9, 11, 1, 3, 1, 4, 'glass'); ell(v, 4, 11, 8, 3, 1, 4, 'glass'); ell(v, 9, 11, 8, 3, 1, 4, 'glass'); v.push([14, 6, 3, 'ink'], [14, 6, 6, 'ink'], [-1, 4, 4, 'ink']); return hi(v); } // a bumblebee: yellow and black stripes, clear wings
function mLadybugHi() { const v = []; for (let x = 0; x < 14; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 12; z++) { const e = ((x - 6.5) / 7) ** 2 + (y / 6.5) ** 2 + ((z - 5.5) / 6) ** 2; if (e <= 1) v.push([x, y, z, (z === 5 || z === 6) && y > 3 ? 'ink' : 'firered']); } for (const [x, z] of [[4, 2], [9, 3], [5, 9], [10, 8], [7, 1], [7, 10]]) ell(v, x, 5, z, 1.2, 1.5, 1.2, 'ink'); ell(v, 15, 2, 5.5, 2.5, 2.5, 3, 'ink'); v.push([17, 3, 4, 'white'], [17, 3, 7, 'white']); return hi(v); } // a ladybug: red with black spots
function mFrogHi() { const v = []; ell(v, 10, 6, 8, 9, 6, 7, 'leaf'); ell(v, 11, 4, 8, 7, 3, 5, 'leaf3'); for (const z of [3, 13]) { ell(v, 15, 12, z, 3, 3, 3, 'leaf'); ell(v, 17, 13, z, 1.6, 1.6, 1.6, 'white'); v.push([18, 13, z, 'ink']); } fbox(v, 17, 7, 5, 2, 1, 6, 'ink'); for (const z of [0, 16]) { fbox(v, 2, 0, z, 10, 3, 2, 'leaf2'); fbox(v, 14, 0, z, 6, 2, 2, 'leaf2'); } return hi(v); } // a frog: big eyes on top, a wide smile, strong back legs


// ---- the repair cafe at the new scale (17 Nov 2026) ----
function mShirtHi() { const v = [], c = 'sky'; for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) { const neck = Math.hypot(x - 24, z) < 7; if (!neck) v.push([x, 0, z, (x + z) % 8 === 0 ? 'sky2' : c]); } fbox(v, -14, 0, 2, 14, 1, 16, c); fbox(v, 48, 0, 2, 14, 1, 16, c); fbox(v, -14, 1, 15, 14, 1, 3, 'white'); fbox(v, 48, 1, 15, 14, 1, 3, 'white'); fbox(v, 15, 1, 0, 7, 1, 6, 'white'); fbox(v, 26, 1, 0, 7, 1, 6, 'white'); fbox(v, 22, 1, 6, 4, 1, 42, 'sky2'); for (const z of [12, 36]) { ell(v, 24, 1, z, 3, 0.5, 3, 'pink'); v.push([23, 2, z - 1, 'ink'], [25, 2, z + 1, 'ink']); } v.push([24, 1, 24, 'ink'], [24, 1, 22, 'pink2'], [24, 1, 26, 'pink2']); return hi(v); } // a shirt laid flat; the middle button is missing (thread ends show where it goes)
function mButtonHi() { const v = []; for (let x = 0; x < 11; x++) for (let z = 0; z < 11; z++) { const d = Math.hypot(x - 5, z - 5); if (d > 5.3) continue; const hole = [[3.5, 3.5], [6.5, 3.5], [3.5, 6.5], [6.5, 6.5]].some(([a, b]) => Math.hypot(x - a, z - b) < 1); v.push([x, 0, z, 'pink']); if (!hole) v.push([x, 1, z, d > 4.3 ? 'pink2' : 'pink']); } return hi(v); } // a button with four holes
function mSpoolHi() { const v = []; for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) { const d = Math.hypot(x - 6.5, z - 6.5); if (d <= 7) { v.push([x, 0, z, 'wood'], [x, 1, z, 'wood'], [x, 16, z, 'wood'], [x, 17, z, 'wood']); } if (d <= 5) for (let y = 2; y < 16; y++) v.push([x, y, z, y % 3 === 0 ? 'pink2' : 'pink']); } fbox(v, 12, 10, 6, 6, 1, 1, 'pink'); return hi(v); } // a spool of pink thread
function mNeedleHi() { const v = []; fbox(v, 0, 0, 0, 30, 2, 2, 'stone'); for (const [x, z] of [[30, 0], [31, 0], [32, 0], [30, 1], [31, 1]]) v.push([x, 0, z, 'stone2']); fbox(v, -6, 0, -2, 6, 2, 1, 'stone'); fbox(v, -6, 0, 3, 6, 2, 1, 'stone'); fbox(v, -7, 0, -1, 1, 2, 4, 'stone'); return hi(v); } // a big blunt practice needle with a wide eye
function mScissorsHi() { const v = []; for (const zc of [4, 16]) for (let x = 0; x < 11; x++) for (let z = 0; z < 11; z++) { const d = Math.hypot(x - 5, z - 5); if (d <= 5.5 && d >= 2.8) v.push([x, 0, zc + z - 5, 'firered'], [x, 1, zc + z - 5, 'firered']); } for (let i = 0; i < 22; i++) { v.push([10 + i, 1, 7 + Math.round(i * 0.12), 'stone'], [10 + i, 1, 13 - Math.round(i * 0.12), 'stone'], [10 + i, 2, 8 + Math.round(i * 0.12), 'stone2']); } ell(v, 13, 2, 10, 1.5, 0.5, 1.5, 'ink'); return hi(v); } // children's safety scissors: red loops, round-tipped blades
function mThreadHi() { const v = []; for (let i = -3; i <= 3; i++) { v.push([5 + i, 2, 5 + i, 'pink2'], [5 + i, 2, 5 - i, 'pink2']); } return hi(v); } // the thread sewn through the holes, criss-cross
function mWheelHi(o) { const v = []; for (let x = -22; x <= 22; x++) for (let y = -22; y <= 22; y++) { let d = Math.hypot(x, y); if (o.flat && y < -15) { if (y < -17) continue; if (Math.abs(x) > 18) continue; d = 19; } if (d <= 21.5 && d >= 17) for (let z = 0; z < 5; z++) v.push([x, y + 22, z, 'ink']); else if (d < 17 && d >= 15.5) for (let z = 1; z < 4; z++) v.push([x, y + 22, z, 'stone']); } for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; for (let r = 3; r < 16; r++) v.push([Math.round(Math.cos(a) * r), 22 + Math.round(Math.sin(a) * r), 2, 'stone2']); } fbox(v, -2, 20, 0, 5, 5, 5, 'ink'); for (let a = 0; a < 60; a++) { const t = a / 60 * Math.PI * 2; v.push([Math.round(Math.cos(t) * 21), 22 + Math.round(Math.sin(t) * (o.flat && Math.sin(t) < -0.7 ? 17 : 21)), 5, 'ink2b']); } return hi(v); } // a bike wheel: tire, rim, spokes, hub; flat at the bottom when it needs air
function mValveHi() { const v = []; fbox(v, 0, 0, 0, 2, 6, 2, 'stone2'); return hi(v); } // the valve stem
function mCapHi() { const v = []; fbox(v, -1, 5, -1, 4, 4, 4, 'ink'); return hi(v); } // the little cap on the valve
function mBikeHi() { // the bike on its stand: a pink frame, a seat, handlebars, the front wheel (the back wheel is its own thing)
  const v = [], line = (x0, y0, x1, y1, k) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) fbox(v, Math.round(x0 + (x1 - x0) * i / n) - 1, Math.round(y0 + (y1 - y0) * i / n) - 1, 1, 3, 3, 3, k); };
  for (const [x, y, z, k] of mWheelHi({})) v.push([x + 16, y + 2, z, k]);
  line(16, 24, 62, 46, 'pink'); line(40, 50, 78, 50, 'pink'); line(64, 24, 76, 50, 'pink'); line(40, 50, 64, 24, 'pink'); line(18, 24, 14, 62, 'pink');
  fbox(v, 34, 52, -2, 14, 4, 10, 'ink'); fbox(v, 2, 62, -6, 22, 3, 3, 'ink'); fbox(v, 0, 60, -6, 4, 6, 3, 'ink'); fbox(v, 22, 60, -6, 4, 6, 3, 'ink');
  fbox(v, 58, 0, -8, 24, 3, 4, 'stone'); fbox(v, 64, 3, -4, 3, 22, 3, 'stone'); return hi(v);
}
function mPumpHi() { const v = []; fbox(v, 0, 0, 0, 22, 2, 10, 'ink'); fbox(v, 8, 2, 2, 6, 40, 6, 'teal'); fbox(v, 8, 30, 2, 6, 1, 6, 'teal2'); fbox(v, 10, 42, 4, 2, 6, 2, 'stone'); fbox(v, 1, 48, 3, 20, 3, 4, 'ink'); ell(v, 11, 10, 8.5, 3, 3, 0.6, 'white'); v.push([11, 11, 9, 'firered'], [12, 12, 9, 'firered']); for (let i = 0; i < 16; i++) v.push([14 + Math.round(Math.sin(i / 5) * 4), 6 + i, 9 + Math.round(i / 4), 'ink']); return hi(v); } // a floor pump: a T handle, a barrel, a gauge, a hose



// ---- more to do at home (17 Nov 2026, B: "Kitchen, room, bathroom"): set the table, put the shopping away, dress for
// the weather, pack the backpack, wash your face, tidy the bathroom ----
function mTableBig() { const v = []; fbox(v, 0, 9, 0, 32, 2, 24, 'wood'); for (const [x, z] of [[1, 1], [29, 1], [1, 21], [29, 21]]) fbox(v, x, 0, z, 2, 9, 2, 'darkwood'); return v; } // a dining table, 4 by 3 blocks
function mPlaceMatHi() { const v = []; for (let x = 0; x < 83; x++) for (let z = 0; z < 53; z++) v.push([x, 0, z, x < 2 || x > 80 || z < 2 || z > 50 ? 'sky' : 'sky2']); return hi(v); } // a place mat
function mForkHi() { const v = []; for (const x of [0, 2, 4, 6]) fbox(v, x, 0, 0, 1, 1, 9, 'stone'); fbox(v, 0, 0, 8, 7, 1, 4, 'stone'); fbox(v, 2, 0, 12, 3, 1, 15, 'stone'); fbox(v, 2, 1, 14, 3, 1, 11, 'white2'); return hi(v); } // a fork, tines away from you
function mKnifeHi() { const v = []; for (let z = 0; z < 14; z++) { const w = z < 3 ? 2 + z : 5; fbox(v, 0, 0, z, w, 1, 1, 'stone'); v.push([0, 1, z, 'stone2']); } fbox(v, 1, 0, 14, 4, 2, 13, 'stone2'); return hi(v); } // a table knife; its blade edge (the left side) faces the plate
function mSpoonHi() { const v = []; ell(v, 3.5, 0, 4.5, 3.6, 0.5, 4.8, 'stone'); for (let x = 0; x < 8; x++) for (let z = 0; z < 10; z++) if (((x - 3.5) / 3.6) ** 2 + ((z - 4.5) / 4.8) ** 2 > 0.6 && ((x - 3.5) / 3.6) ** 2 + ((z - 4.5) / 4.8) ** 2 <= 1) v.push([x, 1, z, 'stone2']); fbox(v, 3, 0, 9, 2, 1, 18, 'stone'); fbox(v, 2, 0, 22, 4, 1, 5, 'stone'); return hi(v); } // a spoon
function mSpotHi(o) { // where a thing goes on the mat: its own shape, drawn as a dashed white outline on a darker patch
  const src = { plate: mPlateHi, fork: mForkHi, knife: mKnifeHi, spoon: mSpoonHi, cup: mCupHi }[o.of](), foot = new Set(src.map((q) => q[0] + ',' + q[2])), v = [];
  for (const k of foot) { const [x, z] = k.split(',').map(Number), edge = ['-1,0', '1,0', '0,-1', '0,1'].some((d) => { const [a, b] = d.split(',').map(Number); return !foot.has((x + a) + ',' + (z + b)); }); v.push([x, 0, z, edge ? ((x + z) % 4 < 2 ? 'white' : 'sky') : 'sky']); }
  return hi(v);
}
function mPantryHi() { const v = []; // an open cupboard for dry food: three shelves, a jar of rice, a bag of flour, oats
  fbox(v, 0, 0, 0, 14, 31, 1, 'cream2'); fbox(v, 0, 0, 0, 1, 31, 8, 'wood'); fbox(v, 13, 0, 0, 1, 31, 8, 'wood'); for (const y of [0, 10, 20, 30]) fbox(v, 0, y, 0, 14, 1, 8, 'wood');
  fbox(v, 1, 11, 3, 2, 5, 3, 'glass'); fbox(v, 1, 11, 3, 2, 3, 3, 'white'); fbox(v, 1, 16, 3, 2, 1, 3, 'pink'); fbox(v, 4, 11, 3, 2, 6, 3, 'glass'); fbox(v, 4, 11, 3, 2, 4, 3, 'bread'); fbox(v, 4, 17, 3, 2, 1, 3, 'teal');
  fbox(v, 2, 21, 2, 5, 7, 4, 'white'); fbox(v, 3, 23, 6, 3, 2, 1, 'sky'); fbox(v, 8, 21, 2, 4, 6, 4, 'orange'); fbox(v, 9, 23, 6, 2, 2, 1, 'white');
  return v; }
function mGroceryBagHi() { const v = []; for (let x = 0; x < 24; x++) for (let y = 0; y < 28; y++) for (let z = 0; z < 16; z++) if (y === 0 || x === 0 || x === 23 || z === 0 || z === 15) v.push([x, y, z, y === 4 || y === 5 ? 'crust' : 'bread']); for (let x = -1; x < 25; x++) for (let z = -1; z < 17; z++) if (x < 0 || x > 23 || z < 0 || z > 15) v.push([x, 27, z, 'crust']); return hi(v); } // a paper shopping bag, open, empty
function mEggBoxHi() { const v = []; fbox(v, 0, 0, 0, 34, 6, 22, 'white2'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ell(v, 6 + i * 11, 8, 6 + j * 10, 4, 5, 4, 'egg'); fbox(v, 0, 6, -1, 34, 18, 2, 'white2'); fbox(v, 8, 10, 1, 18, 8, 1, 'sun'); return hi(v); } // a box of six eggs, lid open
function mCanHi() { const v = []; for (let x = 0; x < 13; x++) for (let z = 0; z < 13; z++) { const d = Math.hypot(x - 6, z - 6); if (d > 6.4) continue; for (let y = 0; y < 17; y++) v.push([x, y, z, y < 2 || y > 14 ? 'stone' : d > 5.4 ? (y > 5 && y < 11 ? 'white' : 'firered') : 'stone']); } for (const [x, y] of [[4, 8], [7, 7], [9, 9], [5, 10]]) v.push([x, y, 13, 'crust']); return hi(v); } // a can of beans
function mRackHi() { const v = []; for (const x of [0, 98]) { fbox(v, x, 0, 0, 3, 76, 3, 'ink'); fbox(v, x - 4, 0, -4, 11, 2, 11, 'ink'); } fbox(v, 0, 72, 0, 101, 3, 3, 'ink'); fbox(v, 52, 34, -2, 47, 2, 12, 'wood'); return hi(v); } // a clothes rack with a little shelf
function mRaincoatHi() { const v = []; fbox(v, 4, 0, 0, 26, 40, 6, 'sun'); fbox(v, 0, 14, 0, 4, 24, 6, 'sun'); fbox(v, 30, 14, 0, 4, 24, 6, 'sun'); fbox(v, 9, 40, 0, 16, 8, 6, 'sun'); fbox(v, 16, 4, 6, 2, 34, 1, 'orange2'); for (const y of [8, 18, 28]) fbox(v, 19, y, 6, 3, 3, 1, 'ink'); fbox(v, 6, 48, 2, 22, 2, 2, 'ink'); fbox(v, 16, 50, 2, 2, 6, 2, 'ink'); fbox(v, 18, 54, 2, 3, 2, 2, 'ink'); return hi(v); } // a yellow raincoat on a hanger
function mSunHatHi() { const v = []; for (let x = 0; x < 31; x++) for (let z = 0; z < 31; z++) { const d = Math.hypot(x - 15, z - 15); if (d <= 15) v.push([x, 0, z, d > 13 ? 'crust' : 'bread']); if (d <= 8) for (let y = 1; y < 9; y++) v.push([x, y, z, y === 2 || y === 3 ? 'pink' : 'bread']); } return hi(v); } // a straw sun hat
function mBootsHi() { const v = []; for (const x0 of [0, 13]) { fbox(v, x0, 0, 0, 10, 2, 16, 'ink'); fbox(v, x0, 2, 0, 10, 4, 16, 'firered'); fbox(v, x0, 6, 0, 10, 14, 10, 'firered'); fbox(v, x0, 19, 0, 10, 1, 10, 'pink2'); } return hi(v); } // red rain boots
function mSandalsHi() { const v = []; for (const x0 of [0, 12]) { fbox(v, x0, 0, 0, 9, 2, 17, 'crust'); fbox(v, x0, 2, 3, 9, 2, 2, 'teal'); fbox(v, x0, 2, 10, 9, 2, 2, 'teal'); fbox(v, x0, 4, 3, 9, 1, 2, 'teal'); fbox(v, x0, 4, 10, 9, 1, 2, 'teal'); } return hi(v); } // sandals: a sole and two straps
function mUmbrellaHi(o) { const v = [];
  if (!o || !o.open) { fbox(v, 0, 0, 0, 2, 60, 2, 'darkwood'); fbox(v, -4, 0, 0, 4, 2, 2, 'darkwood'); fbox(v, -5, 2, 0, 2, 4, 2, 'darkwood'); for (let y = 12; y < 54; y++) { const r = y < 24 ? 2 + (y - 12) / 4 : 5 - (y - 24) / 10; ell(v, 1, y, 1, r, 0.5, r, y === 36 ? 'white' : 'teal'); } fbox(v, 0, 54, 0, 2, 6, 2, 'stone'); return hi(v); } // closed, standing up
  for (let x = -34; x <= 34; x++) for (let z = -34; z <= 34; z++) { const d = Math.hypot(x, z); if (d > 34) continue; const y = 82 + Math.round(Math.sqrt(34 * 34 - d * d) * 0.42), c = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 ? 'teal' : 'white'; v.push([x, y, z, c], [x, y - 1, z, c]); if (d > 32) v.push([x, y - 2, z, 'teal2']); }
  for (let t = 0; t <= 60; t++) { const x = Math.round(13 - 13 * t / 60); v.push([x, 22 + t, 1, 'ink'], [x + 1, 22 + t, 1, 'ink']); } fbox(v, 13, 17, 1, 2, 5, 2, 'darkwood'); fbox(v, 15, 15, 1, 3, 2, 2, 'darkwood');
  return hi(v); } // open, held over your head
function mKidWearHi(o) { // what you put on, drawn to fit over the kid (mKidHi's sizes): a raincoat with a hood, or rain boots
  const v = [], W = 22, D = 12, L = 20, T = 22, HW = 20, HH = 20, b = (x, y, z, w, h, d, k) => fbox(v, x - 11, y, z - 6, w, h, d, k);
  if (o.coat) { b(-1, L - 5, -1, W + 2, T + 5, D + 2, 'sun'); b(-6, L + 3, 2, 7, T - 5, 10, 'sun'); b(W - 1, L + 3, 2, 7, T - 5, 10, 'sun'); for (let i = 0; i < 3; i++) b(10, L - 2 + i * 7, D + 1, 3, 3, 1, 'ink'); b(10, L - 4, D + 1, 1, T + 3, 1, 'orange2');
    const hx = 1, hy = L + T, hz = -3; b(hx - 2, hy - 1, hz - 2, HW + 4, HH + 3, 4, 'sun'); b(hx - 2, hy + HH - 2, hz - 2, HW + 4, 4, 17, 'sun'); b(hx - 2, hy, hz - 2, 2, HH, 15, 'sun'); b(hx + HW, hy, hz - 2, 2, HH, 15, 'sun'); }
  if (o.boots) for (const x0 of [1, W - 12]) { b(x0, 0, -1, 11, 4, D + 4, 'firered'); b(x0 + 1, 4, 1, 9, 10, D - 2, 'firered'); b(x0 + 1, 13, 1, 9, 1, D - 2, 'pink2'); }
  return hi(v);
}
function mRainHi() { const v = []; for (let x = 0; x < 64; x++) for (let y = 0; y < 56; y++) v.push([x, y, 0, 'smoke']); for (let x = 2; x < 64; x += 5) for (let k = 0; k < 4; k++) { const y0 = (x * 7 + k * 15) % 56; for (let y = y0; y < y0 + 6 && y < 56; y++) v.push([x + (y % 2), y, 1, 'white']); } return hi(v); } // a gray, rainy day through the window
function mBackpackHi(o) { const v = []; fbox(v, 0, 0, 0, 30, 30, 14, 'teal'); fbox(v, 2, 30, 1, 26, 4, 12, 'teal'); fbox(v, 5, 4, 14, 20, 14, 3, 'teal2'); fbox(v, 5, 17, 17, 20, 1, 1, 'sun'); fbox(v, 5, 8, -2, 4, 24, 2, 'ink'); fbox(v, 21, 8, -2, 4, 24, 2, 'ink'); fbox(v, 12, 34, 6, 6, 3, 2, 'ink');
  if (o && o.zip) { fbox(v, 2, 34, 6, 26, 1, 2, 'sun'); fbox(v, 25, 31, 13, 3, 4, 1, 'sun'); } else { fbox(v, 4, 34, 2, 22, 1, 10, 'ink'); fbox(v, 2, 34, -1, 26, 2, 3, 'teal2'); }
  return hi(v); } // a backpack: open, or zipped up
function mBackpackZipHi() { return mBackpackHi({ zip: true }); }
function mFolderHi() { const v = []; fbox(v, 0, 0, 0, 30, 1, 24, 'sky'); fbox(v, 2, 1, -2, 26, 1, 24, 'white'); fbox(v, 0, 2, 0, 30, 1, 24, 'sky'); fbox(v, 8, 3, 8, 14, 1, 6, 'white'); fbox(v, 10, 4, 10, 10, 1, 1, 'ink'); return hi(v); } // a homework folder, a page sticking out
function mLunchBoxHi() { const v = []; fbox(v, 0, 0, 0, 26, 16, 14, 'orange'); fbox(v, 0, 16, 0, 26, 2, 14, 'orange2'); fbox(v, 8, 18, 6, 2, 5, 2, 'ink'); fbox(v, 16, 18, 6, 2, 5, 2, 'ink'); fbox(v, 8, 22, 6, 10, 2, 2, 'ink'); fbox(v, 11, 12, 14, 4, 4, 1, 'stone'); ell(v, 7, 7, 14, 3, 3, 0.5, 'apple'); return hi(v); } // a lunch box with a handle
function mBottleHi() { const v = []; for (let x = 0; x < 11; x++) for (let z = 0; z < 11; z++) { const d = Math.hypot(x - 5, z - 5); if (d <= 5.2) for (let y = 0; y < 26; y++) v.push([x, y, z, y > 21 ? 'white' : y > 8 && y < 13 ? 'white' : 'teal']); if (d <= 3) for (let y = 26; y < 29; y++) v.push([x, y, z, 'white']); } fbox(v, 3, 29, 4, 1, 3, 2, 'white'); fbox(v, 7, 29, 4, 1, 3, 2, 'white'); fbox(v, 3, 31, 4, 5, 1, 2, 'white'); return hi(v); } // a water bottle
function mPencilCaseHi() { const v = []; fbox(v, 0, 0, 0, 28, 7, 10, 'pink'); fbox(v, 1, 7, 4, 26, 1, 2, 'sun'); fbox(v, 26, 6, 9, 3, 2, 2, 'sun'); fbox(v, 20, 4, -10, 2, 2, 10, 'sun'); fbox(v, 20, 4, -12, 2, 2, 2, 'bread'); fbox(v, 16, 4, -8, 2, 2, 8, 'sky'); return hi(v); } // a pencil case, two pencils peeking out
function mToyCarHi() { const v = []; fbox(v, 0, 3, 0, 28, 6, 14, 'firered'); fbox(v, 7, 9, 1, 13, 6, 12, 'firered'); fbox(v, 8, 10, 0, 5, 4, 14, 'glass'); fbox(v, 14, 10, 0, 5, 4, 14, 'glass'); for (const x of [3, 20]) for (const z of [-1, 13]) fbox(v, x, 0, z, 6, 6, 2, 'ink'); return hi(v); } // a toy car
function mFaceSudsHi() { const v = []; for (const [x, y, r] of [[31.5, 49, 5], [24, 48, 3.5], [39, 48, 3.5], [9, 27, 4.5], [13, 22, 3], [54, 27, 4.5], [50, 22, 3], [31.5, 5, 4], [26, 6, 3], [37, 6, 3], [31.5, 30, 2.5]]) ell(v, x, y, 3, r, r, 1.4, 'bubble'); return hi(v); } // soap bubbles on your face (none near the eyes)
function mFaceDropsHi() { const v = []; for (const [x, y] of [[12, 30], [8, 20], [52, 31], [56, 21], [28, 48], [38, 50], [30, 4], [40, 8], [20, 10], [46, 12]]) { fbox(v, x, y, 3, 2, 3, 1, 'sky'); v.push([x, y + 3, 3, 'sky2']); } return hi(v); } // water drops on your face
function mFaceWashHi() { const v = []; fbox(v, 0, 0, 0, 12, 22, 12, 'pink'); fbox(v, 2, 6, 12, 8, 10, 1, 'white'); ell(v, 6, 11, 13, 2, 3, 0.5, 'sky'); fbox(v, 4, 22, 4, 4, 3, 4, 'white'); fbox(v, 3, 25, 3, 6, 3, 6, 'white'); fbox(v, 5, 26, 9, 2, 2, 5, 'white'); return hi(v); } // a pump bottle of gentle face wash
function mTowelBarHi() { const v = []; fbox(v, -2, 42, 2, 36, 2, 2, 'stone'); fbox(v, -3, 36, 0, 2, 8, 6, 'stone'); fbox(v, 33, 36, 0, 2, 8, 6, 'stone'); return hi(v); } // an empty towel bar
function mTowelHeapHi() { const v = []; for (const [x, y, z, rx, ry, rz] of [[10, 3, 9, 10, 4, 8], [22, 4, 14, 9, 4, 8], [14, 6, 16, 7, 4, 6]]) ell(v, x, y, z, rx, ry, rz, 'pink'); for (let x = 2; x < 30; x += 7) fbox(v, x, 7, 10, 2, 2, 8, 'white'); return hi(v); } // a wet towel in a heap on the floor
function mClothesHi() { const v = []; ell(v, 12, 3, 10, 11, 3, 9, 'sun'); ell(v, 24, 4, 14, 9, 4, 7, 'sky'); ell(v, 10, 6, 16, 4, 2, 3, 'white'); ell(v, 30, 2, 6, 4, 2, 3, 'white'); return hi(v); } // dirty clothes on the floor: a shirt, pants, socks
function mHamperHi() { const v = []; for (let x = 0; x < 30; x++) for (let y = 0; y < 36; y++) for (let z = 0; z < 24; z++) if (y === 0 || x === 0 || x === 29 || z === 0 || z === 23) v.push([x, y, z, (x + y + z) % 4 < 2 ? 'bread' : 'crust']); for (const x of [-1, 30]) fbox(v, x, 28, 9, 1, 4, 6, 'crust'); return hi(v); } // a woven laundry basket
function mPuddleHi() { const v = []; for (let x = 0; x < 44; x++) for (let z = 0; z < 30; z++) { const a = ((x - 14) / 14) ** 2 + ((z - 14) / 12) ** 2, b = ((x - 30) / 13) ** 2 + ((z - 17) / 10) ** 2; if (a <= 1 || b <= 1) v.push([x, 0, z, (x === 12 || x === 13) && z > 8 && z < 12 ? 'white' : 'water']); } return hi(v); } // a puddle of water on the floor
function mSwitchHi(o) { const v = []; fbox(v, 0, 0, 0, 10, 16, 1, 'white'); fbox(v, 3, 3, 1, 4, 10, 1, 'white2'); fbox(v, 4, o && o.off ? 4 : 9, 2, 2, 3, 2, 'stone'); return hi(v); } // a light switch: up is on
function mSwitchOffHi() { return mSwitchHi({ off: true }); }

// ---- people at the new scale (17 Nov 2026): faces you can read, because the square is about seeing how someone feels ----
function mPersonHi(o) { // a grown-up (or o.kid, a child): shoes, legs, a shirt (and apron), arms, a head with hair and a face; o.mood: smile, sad, shy, oops
  const v = [], kid = !!o.kid, L = kid ? 20 : 34, T = kid ? 22 : 30, W = kid ? 22 : 26, D = kid ? 12 : 14, HW = kid ? 20 : 20, HH = kid ? 20 : 22, skin = o.skin || 'skin';
  const b = (x, y, z, w, h, d, k) => fbox(v, x - Math.floor(W / 2), y, z - Math.floor(D / 2), w, h, d, k);
  b(2, 0, 0, 9, 3, D + 2, 'ink'); b(W - 11, 0, 0, 9, 3, D + 2, 'ink'); b(3, 3, 2, 7, L - 3, D - 4, o.pants || (kid ? 'sky' : 'ink2b')); b(W - 10, 3, 2, 7, L - 3, D - 4, o.pants || (kid ? 'sky' : 'ink2b'));
  b(0, L, 0, W, T, D, o.shirt || (kid ? 'sun' : 'teal')); if (o.apron) b(4, L, D, W - 8, T - 6, 1, o.apron);
  b(-5, L + 4, 3, 5, T - 6, 8, o.shirt || (kid ? 'sun' : 'teal')); b(W, L + 4, 3, 5, T - 6, 8, o.shirt || (kid ? 'sun' : 'teal')); b(-5, L, 3, 5, 4, 8, skin); b(W, L, 3, 5, 4, 8, skin);
  const hx = Math.floor((W - HW) / 2), hy = L + T, hz = Math.floor((D - 16) / 2) - 1;
  b(hx, hy, hz, HW, HH, 16, skin); b(hx - 1, hy + HH - 4, hz - 1, HW + 2, 5, 18, o.hair || 'hair'); b(hx - 1, hy + 6, hz - 1, 2, HH - 6, 12, o.hair || 'hair'); b(hx + HW - 1, hy + 6, hz - 1, 2, HH - 6, 12, o.hair || 'hair');
  if (o.helmet) { b(hx - 2, hy + HH - 2, hz - 2, HW + 4, 5, 20, o.helmet); b(hx - 2, hy + HH - 2, hz + 18, HW + 4, 2, 4, o.helmet); }
  const fz = hz + 16, ey = hy + Math.round(HH * 0.55), mood = o.mood || 'smile', cx = hx + HW / 2;
  for (const dx of [-5, 3]) { b(cx + dx, ey, fz, 3, 3, 1, 'white'); b(cx + dx + (mood === 'shy' ? 0 : 1), mood === 'shy' ? ey : ey, fz + 1, 2, 2, 1, 'ink'); }
  if (mood === 'sad') { b(cx - 6, ey + 4, fz, 4, 1, 1, 'hair'); b(cx + 3, ey + 4, fz, 4, 1, 1, 'hair'); b(cx - 5, ey + 5, fz, 1, 1, 1, 'hair'); b(cx + 6, ey + 5, fz, 1, 1, 1, 'hair'); b(cx - 3, ey - 6, fz, 6, 1, 1, 'ink'); b(cx - 4, ey - 7, fz, 1, 1, 1, 'ink'); b(cx + 3, ey - 7, fz, 1, 1, 1, 'ink'); b(cx - 5, ey - 3, fz, 1, 2, 1, 'sky'); }
  else if (mood === 'oops') { b(cx - 6, ey + 5, fz, 4, 1, 1, 'hair'); b(cx + 3, ey + 5, fz, 4, 1, 1, 'hair'); b(cx - 1, ey - 8, fz, 3, 4, 1, 'ink'); }
  else if (mood === 'shy') { b(cx - 2, ey - 6, fz, 4, 1, 1, 'ink'); b(cx - 7, ey - 3, fz, 3, 2, 1, 'pink'); b(cx + 5, ey - 3, fz, 3, 2, 1, 'pink'); }
  else { b(cx - 4, ey - 6, fz, 9, 1, 1, 'ink'); b(cx - 5, ey - 5, fz, 1, 1, 1, 'ink'); b(cx + 5, ey - 5, fz, 1, 1, 1, 'ink'); b(cx - 3, ey - 7, fz, 7, 1, 1, 'ink'); b(cx - 2, ey - 6, fz + 0, 5, 1, 1, 'white'); }
  b(cx - 1, ey - 3, fz, 2, 2, 1, 'skin2');
  return hi(v);
}
function mKidHi(o) { return mPersonHi(Object.assign({ kid: true }, o)); }

// ---- where food comes from (B, 15 Nov 2026: "Where food comes from") ----
function mCheese() { const v = []; for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) for (let y = 0; y < 4 - (x >> 1); y++) v.push([x, y, z, (x + y + z) % 5 === 0 ? 'cheese2' : 'cheese']); return v; } // a wedge with holes
function mMilk() { const v = []; fbox(v, 0, 0, 0, 3, 6, 3, 'white'); fbox(v, 0, 2, 3, 3, 2, 1, 'sky'); fbox(v, 0, 6, 1, 3, 1, 1, 'white'); v.push([1, 7, 1, 'sky']); return v; }
function mEgg() { const v = []; fbox(v, 0, 0, 0, 3, 1, 3, 'wood'); for (let x = 0; x < 3; x++) for (let y = 1; y < 5; y++) for (let z = 0; z < 3; z++) if ((x - 1) ** 2 + ((y - 2.6) / 1.5) ** 2 + (z - 1) ** 2 <= 1.6) v.push([x, y, z, 'egg']); return v; } // an egg in a cup
function mHoney() { const v = []; fbox(v, 0, 0, 0, 4, 4, 4, 'honey'); fbox(v, 0, 4, 0, 4, 1, 4, 'darkwood'); fbox(v, 1, 1, 4, 2, 2, 1, 'white'); return v; }
function mBread() { const v = []; fbox(v, 0, 0, 0, 6, 3, 4, 'bread'); fbox(v, 1, 3, 0, 4, 1, 4, 'crust'); for (const x of [1, 3]) v.push([x, 3, 1, 'bread'], [x + 1, 3, 2, 'bread']); return v; }
function mPasta() { const v = []; fbox(v, 0, 0, 0, 4, 6, 2, 'sun'); fbox(v, 1, 2, 2, 2, 2, 1, 'white'); fbox(v, 1, 6, 0, 1, 2, 1, 'cheese'); fbox(v, 2, 6, 1, 1, 2, 1, 'cheese'); return v; } // a box of dry pasta
function mApple() { const v = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) if ((x - 1.5) ** 2 + (y - 1.5) ** 2 + (z - 1.5) ** 2 <= 3.2) v.push([x, y, z, 'apple']); v.push([2, 4, 2, 'darkwood'], [2, 5, 2, 'leaf'], [3, 5, 2, 'leaf']); return v; }
function mCarrot() { const v = []; for (let x = 0; x < 7; x++) { const r = x < 2 ? 1 : x < 5 ? 1 : 0; for (let y = 0; y <= r; y++) for (let z = 0; z <= r; z++) v.push([x, y, z, 'orange']); } v.push([-1, 1, 0, 'leaf'], [-2, 2, 0, 'leaf'], [-1, 2, 1, 'leaf'], [-2, 3, 1, 'leaf']); return v; }
function mBasket(o) { // a wicker basket with a picture sign: a leaf for plants, a cow for animals
  const v = [], W = 12, D = 10, H = 5;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === 0 || x === 0 || x === W - 1 || z === 0 || z === D - 1) v.push([x, y, z, (x + y) % 2 ? 'wood' : 'crust']);
  fbox(v, 2, H, D - 1, 8, 6, 1, 'white'); fbox(v, 1, 0, D, 1, H + 6, 1, 'darkwood'); fbox(v, 10, 0, D, 1, H + 6, 1, 'darkwood');
  const icon = o.kind === 'plant' ? [[4, 7], [5, 7], [5, 8], [6, 8], [6, 9], [7, 9], [5, 9], [4, 8], [6, 7], [3, 6]] : [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [3, 9], [7, 9], [5, 6], [4, 6], [6, 6]];
  for (const [x, y] of icon) v.push([x, H + y - 6 + 1, D, o.kind === 'plant' ? 'leaf' : (x === 4 && y === 8) || (x === 6 && y === 7) ? 'ink' : (y === 6 ? 'pink' : 'white2')]);
  return v;
}

// ---- make a sandwich (B, 15 Nov 2026: "Make a sandwich") ----
function mPlate() { const v = []; for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) { const e = ((x - 4.5) / 5) ** 2 + ((z - 3.5) / 4) ** 2; if (e <= 1) v.push([x, 0, z, e > 0.7 ? 'sky' : 'white']); } return v; }
function mPlates() { const v = []; for (let y = 0; y < 3; y++) for (const [x, y2, z, k] of mPlate()) v.push([x, y, z, k]); return v; }
function mBreadBag() { const v = []; fbox(v, 0, 0, 0, 7, 4, 5, 'bread'); fbox(v, 0, 4, 0, 7, 1, 5, 'crust'); fbox(v, 7, 0, 1, 2, 3, 3, 'bag'); v.push([9, 2, 2, 'sun'], [9, 1, 2, 'sun']); return v; }
function mSlice() { const v = []; for (let x = 0; x < 7; x++) for (let z = 0; z < 6; z++) v.push([x, 0, z, x === 0 || x === 6 || z === 0 || z === 5 ? 'crust' : 'bread']); return v; }
function mButter() { const v = []; fbox(v, 0, 0, 0, 7, 1, 5, 'white'); fbox(v, 1, 1, 1, 4, 2, 3, 'butter'); fbox(v, 5, 1, 1, 4, 1, 1, 'stone'); return v; } // a dish with butter and a butter knife
function mLayer(o) { const v = []; for (let x = 0; x < 7; x++) for (let z = 0; z < 6; z++) if (!(o.wavy && (x + z) % 5 === 0 && (x === 0 || x === 6 || z === 0 || z === 5))) v.push([x, 0, z, o.c]); return v; }
function mLettuce() { const v = []; for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 6; z++) if ((x - 2.5) ** 2 + ((y - 2) * 1.2) ** 2 + (z - 2.5) ** 2 <= 7) v.push([x, y, z, (x + y + z) % 3 ? 'leaf3' : 'leaf']); return v; }
function mCheeseSlices() { const v = []; for (let y = 0; y < 3; y++) fbox(v, 0, y, 0, 6, 1, 6, y % 2 ? 'cheese2' : 'cheese'); return v; }

// ---- your garden (B, 15 Nov 2026: "The garden") ----
function mRaisedBed() { const v = []; for (let x = 0; x < 24; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 16; z++) { const edge = x === 0 || x === 23 || z === 0 || z === 15; if (edge) v.push([x, y, z, (x + z) % 4 === 0 ? 'darkwood' : 'wood']); else if (y === 5) v.push([x, y, z, (z % 4 === 1) ? 'soil2' : 'soil']); else v.push([x, y, z, 'soil']); } return v; }
function mTrowel() { const v = []; fbox(v, 0, 0, 0, 1, 1, 4, 'wood'); fbox(v, 0, 0, 4, 1, 1, 1, 'ink'); fbox(v, -1, 0, 5, 3, 1, 3, 'stone'); v.push([0, 0, 8, 'stone']); return v; }
function mSeeds() { const v = []; fbox(v, 0, 0, 0, 5, 1, 6, 'white'); fbox(v, 1, 1, 1, 3, 1, 2, 'leaf'); v.push([2, 1, 4, 'bean'], [1, 1, 4, 'bean'], [3, 1, 4, 'bean']); return v; }
function mCan() { const v = []; fbox(v, 0, 0, 0, 5, 4, 3, 'sky'); fbox(v, 5, 2, 1, 4, 1, 1, 'sky'); v.push([9, 3, 1, 'sky']); fbox(v, 1, 4, 1, 3, 2, 1, 'sky'); return v; }
function mHole() { const v = []; fbox(v, 0, 0, 0, 3, 1, 3, 'hole'); return v; }
function mBean() { const v = []; v.push([0, 0, 0, 'bean'], [0, 0, 1, 'bean']); return v; }
function mMound() { const v = []; fbox(v, 0, 0, 0, 4, 1, 4, 'soil2'); return v; }
function mDrops() { const v = []; for (const [x, y, z] of [[0, 3, 0], [2, 1, 1], [1, 5, 2], [3, 4, 0], [2, 7, 1], [0, 6, 2]]) v.push([x, y, z, 'water']); return v; }
function mSprout() { const v = []; fbox(v, 0, 0, 0, 1, 3, 1, 'leaf'); v.push([-1, 3, 0, 'leaf3'], [1, 3, 0, 'leaf3'], [-2, 4, 0, 'leaf3'], [2, 4, 0, 'leaf3']); return v; }
function mBeanPlant() { // a bush bean plant: a stem and broad leaves in threes
  const v = []; fbox(v, 0, 0, 0, 1, 9, 1, 'leaf2');
  for (const [cx, cy, cz] of [[-3, 5, 0], [3, 6, 1], [0, 8, -3], [-2, 9, 2], [2, 10, -1], [0, 11, 1]]) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.push([cx + x, cy, cz + z, (x + z) % 2 ? 'leaf' : 'leaf3']);
  return v;
}
function mFlowers() { const v = []; for (const [x, y, z] of [[-2, 7, 1], [2, 8, 0], [0, 10, -2], [-1, 11, 3], [3, 9, 2]]) v.push([x, y, z, 'white'], [x, y + 1, z, 'pink']); return v; }
function mPods() { const v = []; for (const [x, y, z] of [[-2, 4, 1], [2, 5, 0], [1, 7, -2], [-1, 6, 3], [3, 7, 2]]) { v.push([x, y, z, 'leaf2'], [x, y - 1, z, 'leaf2'], [x, y - 2, z, 'leaf2']); } return v; }
function mWeed() { const v = []; fbox(v, 0, 0, 0, 1, 2, 1, 'weed'); v.push([-1, 2, 0, 'weed'], [1, 3, 0, 'weed'], [0, 3, -1, 'weed'], [0, 4, 1, 'weed'], [-1, 4, 0, 'weed'], [1, 5, 0, 'sun']); return v; }
function mSun() { const v = []; for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (let z = -2; z <= 2; z++) if (x * x + y * y + z * z * 4 <= 22) v.push([x, y, z, 'sun']); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let k = 7; k < 9; k++) v.push([dx * k, dy * k, 0, 'orange']); v.push([-2, 1, 3, 'ink'], [2, 1, 3, 'ink'], [-1, -2, 3, 'ink'], [0, -2, 3, 'ink'], [1, -2, 3, 'ink']); return v; } // a friendly sun
function mFence(o) { const v = [], n = (o.len || 8) * F; for (let i = 0; i < n; i += 3) { const p = o.alongZ ? [0, 0, i] : [i, 0, 0]; fbox(v, p[0], 0, p[2], 1, 7, 1, 'white'); } for (const y of [2, 5]) fbox(v, 0, y, 0, o.alongZ ? 1 : n, 1, o.alongZ ? n : 1, 'white'); return v; }

// ---- the workshop (B, 15 Nov 2026: "The workshop") ----
function mBench() { const v = []; fbox(v, 0, 8, 0, 40, 2, 12, 'wood'); for (const [x, z] of [[0, 0], [38, 0], [0, 10], [38, 10]]) fbox(v, x, 0, z, 2, 8, 2, 'darkwood'); fbox(v, 2, 2, 2, 36, 1, 8, 'darkwood'); fbox(v, 30, 10, 3, 4, 3, 6, 'ink'); fbox(v, 31, 13, 4, 2, 1, 4, 'stone'); return v; } // with a vise at one end
function mPegboard() { const v = []; for (let x = 0; x < 40; x++) for (let y = 0; y < 14; y++) v.push([x, y, 0, (x % 3 === 1 && y % 3 === 1) ? 'crust' : 'peg']); fbox(v, 4, 4, 1, 9, 2, 1, 'stone'); fbox(v, 12, 3, 1, 2, 4, 1, 'pink'); for (let x = 4; x < 13; x += 2) v.push([x, 3, 1, 'stone']); fbox(v, 20, 3, 1, 1, 8, 1, 'sun'); fbox(v, 26, 4, 1, 6, 6, 1, 'ink'); fbox(v, 27, 5, 1, 4, 4, 1, 'peg'); return v; } // a saw, a ruler, a coil of rope hang on it
function mHammer() { const v = []; fbox(v, 0, 0, 0, 1, 1, 6, 'wood'); fbox(v, -1, 0, 6, 3, 1, 1, 'ink'); v.push([-2, 0, 6, 'ink']); return v; }
function mScrewdriver() { const v = []; fbox(v, 0, 0, 0, 1, 1, 3, 'teal'); fbox(v, 0, 0, 3, 1, 1, 4, 'stone'); return v; }
function mWrench() { const v = []; fbox(v, 0, 0, 1, 1, 1, 5, 'stone'); fbox(v, -1, 0, 0, 3, 1, 1, 'stone'); v.push([-1, 0, 6, 'stone'], [1, 0, 6, 'stone']); return v; }
function mTape() { const v = []; fbox(v, 0, 0, 0, 3, 3, 2, 'sun'); fbox(v, 1, 1, 2, 1, 1, 1, 'ink'); fbox(v, 3, 0, 0, 3, 1, 1, 'white'); return v; }
function mGoggles() { const v = []; fbox(v, 0, 0, 0, 2, 1, 2, 'glass'); fbox(v, 3, 0, 0, 2, 1, 2, 'glass'); v.push([2, 0, 1, 'ink'], [-1, 0, 1, 'ink'], [5, 0, 1, 'ink']); return v; }
function mScrewOut() { const v = []; v.push([0, 0, 0, 'stone'], [1, 0, 0, 'stone'], [2, 0, 0, 'ink']); return v; } // a screw sticking out of the chair
function mPlankNail() { const v = []; fbox(v, 0, 0, 0, 16, 1, 4, 'wood'); return v; }
function mNailUp() { const v = []; fbox(v, 0, 0, 0, 1, 3, 1, 'stone'); v.push([0, 3, 0, 'ink']); return v; }
function mNailDown() { const v = []; v.push([0, 0, 0, 'ink']); return v; }
function mBoard() { const v = []; fbox(v, 0, 0, 0, 16, 1, 5, 'crust'); return v; }
function mMark() { const v = []; fbox(v, 0, 0, 0, 1, 1, 5, 'ink'); return v; }
function mWagon() { const v = []; fbox(v, 0, 2, 0, 12, 4, 7, 'pink'); fbox(v, 1, 3, 1, 10, 3, 5, 'pink2'); for (const [x, z] of [[1, -1], [8, -1], [1, 7], [8, 7]]) fbox(v, x, 0, z, 3, 3, 1, 'ink'); fbox(v, 12, 4, 3, 4, 1, 1, 'ink'); return v; }
function mBoltLoose() { const v = []; v.push([0, 0, 0, 'stone'], [0, 0, 1, 'stone'], [0, 0, 2, 'sun']); return v; }

// ---- the market (B, 15 Nov 2026: "More places") ----
function mStand(o) { const v = [], W = (o.w || 2) * F, D = o.d || 9, H = o.h || 9; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (y === H - 1 || x === 0 || x === W - 1 || z === 0 || (z === D - 1 && (y < 2 || y % 4 === 0))) v.push([x, y, z, y === H - 1 ? (o.top || 'wood') : (o.c || 'wood')]); return v; }
function mCrate(o) { const v = []; for (let x = 0; x < 12; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 8; z++) if (y === 0 || x === 0 || x === 11 || z === 0 || z === 7) v.push([x, y, z, 'crust']); for (let x = 1; x < 11; x += 2) for (let z = 1; z < 7; z += 2) v.push([x, 4, z, o.fruit || 'apple'], [x + 1, 4, z + 1, o.fruit || 'apple'], [x, 5, z + 1, 'leaf']); return v; }
function mApples() { const v = []; fbox(v, 0, 0, 0, 6, 4, 4, 'bag'); for (const [x, z] of [[1, 1], [3, 1], [2, 2]]) { fbox(v, x, 4, z, 2, 2, 2, 'apple'); v.push([x, 6, z, 'darkwood']); } return v; } // a bag of apples
function mCooler() { const v = []; fbox(v, 0, 0, 0, 14, 20, 9, 'white'); fbox(v, 1, 2, 9, 12, 16, 1, 'glass'); for (const y of [7, 13]) fbox(v, 1, y, 3, 12, 1, 6, 'stone'); for (const [x, y] of [[2, 8], [5, 8], [8, 14], [10, 8]]) { fbox(v, x, y, 4, 2, 4, 2, 'white'); v.push([x, y + 2, 6, 'sky']); } return v; }
function mCandy() { const v = []; fbox(v, 0, 0, 0, 8, 10, 6, 'pink'); for (let y = 2; y < 10; y += 3) for (let x = 1; x < 7; x += 2) v.push([x, y, 6, ['sun', 'teal', 'white', 'sky'][(x + y) % 4]]); fbox(v, 2, 10, 2, 4, 3, 2, 'glass'); return v; } // a candy rack
function mToyShelf() { const v = []; fbox(v, 0, 0, 0, 6, 16, 12, 'wood'); for (const [y, z, c] of [[16, 2, 'sun'], [16, 7, 'sky'], [8, 3, 'pink']]) fbox(v, 1, y === 16 ? 16 : 10, z, 4, 3, 3, c); return v; }
function mShopBasket() { const v = []; for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 10; z++) if (y === 0 || x === 0 || x === 11 || z === 0 || z === 9) v.push([x, y, z, (x + y) % 2 ? 'sky' : 'teal']); fbox(v, 1, 5, 4, 1, 4, 2, 'ink'); fbox(v, 10, 5, 4, 1, 4, 2, 'ink'); fbox(v, 1, 9, 4, 10, 1, 2, 'ink'); return v; }
function mRegister() { const v = []; fbox(v, 0, 0, 0, 6, 3, 5, 'ink'); fbox(v, 1, 3, 0, 4, 3, 1, 'teal'); fbox(v, 1, 3, 2, 4, 1, 3, 'stone'); fbox(v, 0, 0, 5, 6, 1, 2, 'stone'); return v; }
function mBill() { const v = []; fbox(v, 0, 0, 0, 6, 1, 3, 'money'); v.push([2, 1, 1, 'money2'], [3, 1, 1, 'money2']); return v; } // a 10-dollar bill
function mCounter2() { const v = []; fbox(v, 0, 0, 0, 24, 9, 10, 'cabinet'); fbox(v, -1, 9, -1, 26, 1, 12, 'counter'); return v; }
function mPerson(o) { // a grown-up: taller, an apron
  const v = [], f = (x0, y0, z0, w, h, d, k) => { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) v.push([x - 3, y, z - 2, k]); };
  f(1, 0, 1, 2, 9, 2, 'ink'); f(4, 0, 1, 2, 9, 2, 'ink'); f(0, 9, 0, 7, 9, 4, o.shirt || 'teal'); f(1, 9, 4, 5, 8, 1, o.apron || 'white');
  f(-1, 10, 1, 1, 7, 2, 'skin'); f(7, 10, 1, 1, 7, 2, 'skin'); f(1, 18, 0, 5, 5, 4, 'skin'); f(1, 22, 0, 5, 1, 4, o.hair || 'hair'); f(1, 19, 0, 5, 3, 1, o.hair || 'hair');
  if (o.helmet) { f(0, 23, -1, 7, 2, 6, o.helmet); f(2, 25, 0, 3, 1, 4, o.helmet); }
  v.push([-1, 20, 2, 'ink'], [1, 20, 2, 'ink'], [0, 19, 2, 'pink']);
  return v;
}

// ---- the fire station (B, 15 Nov 2026: "Fire station") ----
function mTruck() { // a fire truck: red, a ladder on top, big wheels, a light
  const v = []; fbox(v, 0, 3, 0, 40, 12, 16, 'firered'); fbox(v, 30, 15, 0, 10, 6, 16, 'firered'); fbox(v, 32, 16, 16, 7, 4, 1, 'glass'); fbox(v, 32, 16, -1, 7, 4, 1, 'glass');
  for (let x = 2; x < 30; x += 3) fbox(v, x, 15, 3, 1, 1, 10, 'stone'); fbox(v, 2, 16, 3, 28, 1, 1, 'stone'); fbox(v, 2, 16, 12, 28, 1, 1, 'stone');
  for (const x of [5, 30]) for (const z of [-1, 16]) fbox(v, x, 0, z, 6, 6, 1, 'ink'); fbox(v, 34, 21, 6, 3, 2, 4, 'sky'); fbox(v, 0, 8, 16, 40, 1, 1, 'white');
  return v;
}
function mBin(o) { // a bin with a picture sign: a phone for Call 9-1-1, a house for Ask a grown-up
  const v = [], red = o.kind === 'call';
  for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 10; z++) if (y === 0 || x === 0 || x === 11 || z === 0 || z === 9) v.push([x, y, z, red ? 'firered' : 'teal']);
  fbox(v, 2, 6, 9, 8, 7, 1, 'white');
  if (red) { fbox(v, 4, 8, 10, 4, 3, 1, 'ink'); v.push([4, 11, 10, 'ink'], [7, 11, 10, 'ink'], [5, 9, 10, 'white'], [6, 9, 10, 'white']); }
  else { fbox(v, 4, 7, 10, 4, 3, 1, 'sun'); v.push([5, 10, 10, 'pink'], [6, 10, 10, 'pink'], [4, 10, 10, 'pink'], [7, 10, 10, 'pink'], [5, 11, 10, 'pink'], [6, 11, 10, 'pink'], [5, 7, 10, 'darkwood']); }
  return v;
}
function mCard(o) { // a picture card standing on the table
  const v = []; fbox(v, 0, 0, 0, 6, 7, 1, 'white'); const P = (x, y, c) => v.push([x, y, 1, c]);
  if (o.pic === 'fire') { for (const [x, y] of [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]]) P(x, y, 'cream'); for (const [x, y] of [[2, 4], [3, 5], [2, 5], [3, 4], [1, 4], [4, 4]]) P(x, y, 'orange'); P(2, 6, 'firered'); P(3, 6, 'sun'); }
  else if (o.pic === 'hurt') { for (let x = 1; x < 5; x++) P(x, 2, 'sky'); P(5, 2, 'skin'); P(1, 1, 'ink'); P(4, 1, 'ink'); P(2, 4, 'firered'); P(3, 4, 'firered'); P(2, 5, 'firered'); P(3, 3, 'firered'); }
  else if (o.pic === 'toy') { for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3], [2, 4], [3, 4], [1, 5], [4, 5]]) P(x, y, 'wood'); P(2, 5, 'ink'); P(4, 1, 'sky'); P(5, 6, 'ink'); }
  else { for (const [x, y] of [[1, 2], [2, 2], [3, 3], [4, 3], [1, 4], [2, 4], [3, 5], [4, 5]]) P(x, y, (x + y) % 2 ? 'teal' : 'sun'); P(5, 6, 'ink'); }
  fbox(v, 1, -1, -2, 4, 1, 3, 'wood'); return v;
}
function mPhoneBig() { // a big pretend phone, standing: a dark screen, a keypad of 12 keys
  const v = []; fbox(v, 0, 0, 0, 11, 17, 2, 'ink'); fbox(v, 1, 13, 2, 9, 3, 1, 'mirror');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const x = 1 + c * 3, y = 10 - r * 3; if (!((r === 0 && c === 0) || (r === 2 && c === 2))) fbox(v, x, y, 2, 2, 2, 1, 'white'); }
  v.push([1, 0, 2, 'firered'], [9, 0, 2, 'firered']); return v;
}
function mKey(o) { const v = []; fbox(v, 0, 0, 0, 2, 2, 1, o.c || 'sun'); v.push([o.n === 1 ? 1 : 0, 1, 1, 'ink'], [o.n === 1 ? 1 : 1, 0, 1, 'ink']); return v; } // the 9 and the 1 keys, in sun yellow so they stand out
function mPracticeWall() { const v = []; for (let x = 0; x < 20; x++) for (let y = 0; y < 22; y++) if (!(x >= 8 && x < 15 && y < 15)) v.push([x, y, 0, y > 18 ? 'roofred' : (x + y) % 6 === 0 ? 'cream2' : 'cream']); fbox(v, 8, 15, 1, 7, 1, 1, 'white'); fbox(v, 2, 8, 1, 4, 4, 1, 'glass'); return v; } // a practice wall with a doorway and a window
function mAlarm() { const v = []; for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) if ((x - 1.5) ** 2 + (z - 1.5) ** 2 <= 3) v.push([x, 0, z, 'white']); v.push([1, -1, 1, 'firered'], [2, -1, 2, 'stone']); return v; } // a smoke alarm on the ceiling of the practice wall
function mSmoke() { const v = []; for (const [x, y, z, r] of [[3, 2, 1, 2], [7, 3, 1, 2], [11, 2, 1, 2], [5, 5, 1, 1], [9, 5, 1, 1]]) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) v.push([x + a, y + b, z, 'smoke']); return v; }
function mDoor() { const v = []; fbox(v, 0, 0, 0, 7, 15, 1, 'darkwood'); v.push([5, 7, 1, 'sun']); return v; }
function mMat2() { const v = []; for (let x = 0; x < 16; x++) for (let z = 0; z < 8; z++) v.push([x, 0, z, (x >> 1) % 2 ? 'sky' : 'white']); return v; }
function mFireHouse() { // the fire station on the street: brick red, a big garage door facing the road, a light on the roof
  const v = [], W = 56, D = 32, H = 30;
  fbox(v, -1, 0, -1, W + 2, 1, D + 2, 'stone');
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
    if (z === 0 && x >= 8 && x < 30 && y < 22) continue; // the big garage doorway
    if (z === 0 && x >= 36 && x < 42 && y < 14) continue; // the people door
    v.push([x, y, z, (y % 4 === 0 || (x + (y >> 2)) % 6 === 0) ? 'brick2' : 'brick']);
  }
  for (let y = 1; y < 22; y++) for (let x = 8; x < 30; x++) if (y % 5 === 0 || x === 8 || x === 29) v.push([x, y, 1, 'white']); else if (y > 14 && x % 4 !== 0) v.push([x, y, 1, 'glass']); else v.push([x, y, 1, 'white2']);
  fbox(v, 36, 1, 1, 6, 13, 1, 'firered'); v.push([40, 7, 0, 'sun']);
  fbox(v, -2, H, -2, W + 4, 2, D + 4, 'stone'); fbox(v, 10, 23, -1, 36, 5, 1, 'white'); for (let x = 12; x < 44; x += 4) fbox(v, x, 24, -2, 2, 3, 1, 'firered'); // a sign board
  fbox(v, 26, H + 2, 14, 4, 3, 4, 'firered'); fbox(v, 27, H + 5, 15, 2, 1, 2, 'sun');
  return v;
}

// ---- the library (B, 15 Nov 2026: "The library") ----
function mBookcase(o) { // tall shelves full of books in every color
  const v = [], W = (o.w || 3) * F, H = 26, D = 6, C = ['book1', 'book2', 'book3', 'teal', 'pink', 'sky', 'sun', 'orange', 'leaf'];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) if (z === 0 || x === 0 || x === W - 1 || y === 0 || y === H - 1 || y % 6 === 0) v.push([x, y, z, 'wood']);
  for (let sh = 0; sh < 4; sh++) for (let x = 1; x < W - 1; x++) { const h = 3 + ((x * 7 + sh * 3) % 3); if ((x * 13 + sh) % 9 === 0) continue; fbox(v, x, sh * 6 + 1, 1, 1, h, 4, C[(x * 5 + sh * 2) % C.length]); }
  return v;
}
function mBigBook(o) { // a big topic book standing up, its cover showing what it is about
  const v = []; fbox(v, 0, 0, 0, 6, 8, 2, o.c || 'teal'); fbox(v, 0, 0, 0, 1, 8, 2, 'darkwood'); fbox(v, 1, 1, 2, 4, 6, 1, 'white'); const P = (x, y, c) => v.push([x, y, 3, c]);
  if (o.pic === 'bug') { P(2, 3, 'ink'); P(3, 3, 'ink'); P(2, 4, 'ink'); P(3, 4, 'ink'); for (const [x, y] of [[1, 2], [4, 2], [1, 5], [4, 5], [1, 3], [4, 4]]) P(x, y, 'ink'); }
  else if (o.pic === 'space') { P(2, 4, 'sun'); P(3, 4, 'sun'); P(2, 3, 'sun'); P(3, 3, 'sun'); P(1, 6, 'sun'); P(4, 1, 'sun'); P(4, 6, 'sky'); }
  else if (o.pic === 'bird') { P(2, 3, 'sky'); P(3, 3, 'sky'); P(2, 4, 'sky'); P(3, 5, 'sky'); P(4, 4, 'orange'); P(1, 2, 'sky'); }
  else { P(2, 4, 'darkwood'); P(3, 4, 'darkwood'); P(2, 3, 'darkwood'); P(3, 3, 'darkwood'); P(1, 5, 'darkwood'); P(4, 5, 'darkwood'); P(3, 2, 'pink'); }
  return v;
}
function mClaim(o) { // a claim card: a picture of what someone said
  const v = []; fbox(v, 0, 0, 0, 6, 1, 5, 'white'); const P = (x, z, c) => v.push([x, 1, z, c]);
  if (o.pic === 'spider') { P(2, 2, 'ink'); P(3, 2, 'ink'); for (const [x, z] of [[1, 1], [4, 1], [1, 3], [4, 3], [0, 2], [5, 2], [1, 2], [4, 2]]) P(x, z, 'ink'); }
  else if (o.pic === 'sun') { P(2, 2, 'sun'); P(3, 2, 'sun'); P(2, 3, 'sun'); P(3, 3, 'sun'); P(1, 1, 'orange'); P(4, 4, 'orange'); P(4, 1, 'orange'); P(1, 4, 'orange'); }
  else if (o.pic === 'penguin') { P(2, 1, 'ink'); P(3, 1, 'ink'); P(2, 2, 'white2'); P(3, 2, 'ink'); P(2, 3, 'ink'); P(3, 3, 'ink'); P(2, 4, 'orange'); P(5, 0, 'sky'); P(0, 4, 'sky'); }
  else { P(2, 2, 'ink'); P(3, 2, 'ink'); P(1, 1, 'ink'); P(4, 1, 'ink'); P(0, 1, 'ink'); P(5, 1, 'ink'); P(2, 3, 'ink'); }
  return v;
}
function mBoard(o) { // a display board: True (teal, a check) or Not true (pink, a line)
  const v = [], c = o.kind === 'true' ? 'teal' : 'pink'; fbox(v, 0, 0, 0, 14, 12, 1, c); fbox(v, 1, 1, 1, 12, 10, 1, 'white');
  if (o.kind === 'true') for (const [x, y] of [[3, 8], [4, 7], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]]) v.push([x, y, 2, 'teal']); else fbox(v, 3, 8, 2, 8, 1, 1, 'pink');
  fbox(v, 1, -10, 0, 1, 10, 1, 'darkwood'); fbox(v, 12, -10, 0, 1, 10, 1, 'darkwood'); return v;
}
function mCereal() { const v = []; fbox(v, 0, 0, 0, 5, 7, 2, 'firered'); fbox(v, 1, 4, 2, 3, 2, 1, 'sun'); v.push([2, 2, 2, 'white'], [1, 1, 2, 'sun'], [3, 1, 2, 'sun'], [4, 6, 2, 'sky']); return v; } // a cereal box, bright and loud
function mTvAd() { const v = []; fbox(v, 0, 0, 0, 7, 6, 2, 'ink'); fbox(v, 1, 1, 2, 5, 4, 1, 'sky'); v.push([2, 2, 3, 'sun'], [3, 2, 3, 'sun'], [3, 3, 3, 'pink'], [5, 4, 3, 'sun'], [1, 4, 3, 'sun']); fbox(v, 2, -2, 0, 1, 2, 1, 'ink'); fbox(v, 4, -2, 0, 1, 2, 1, 'ink'); return v; } // a TV showing a toy advert
function mStoryBook() { const v = []; fbox(v, 0, 0, 0, 6, 1, 5, 'pink'); fbox(v, 0, 1, 0, 6, 1, 5, 'white'); v.push([2, 2, 2, 'leaf'], [3, 2, 2, 'sun'], [4, 2, 3, 'sky']); return v; }
function mAtlas() { const v = []; fbox(v, 0, 0, 0, 6, 1, 5, 'sky'); for (const [x, z] of [[1, 1], [2, 1], [2, 2], [4, 3], [4, 2], [3, 3]]) v.push([x, 1, z, 'leaf']); return v; } // a book of maps
function mBin2(o) { const v = []; for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 10; z++) if (y === 0 || x === 0 || x === 11 || z === 0 || z === 9) v.push([x, y, z, o.kind === 'sell' ? 'pink' : 'teal']); fbox(v, 2, 5, 9, 8, 6, 1, 'white'); if (o.kind === 'sell') { fbox(v, 4, 7, 10, 4, 2, 1, 'sun'); v.push([5, 9, 10, 'sun'], [6, 9, 10, 'sun']); } else { fbox(v, 3, 7, 10, 6, 3, 1, 'book2'); fbox(v, 6, 7, 10, 1, 3, 1, 'white'); } return v; }
function mBeanbag(o) { const v = []; for (let x = 0; x < 9; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 9; z++) if (((x - 4) / 4.5) ** 2 + ((y - 1) / 5) ** 2 + ((z - 4) / 4.5) ** 2 <= 1 && y >= 0) v.push([x, y, z, o.c || 'sun']); return v; }
function mGlobe() { const v = []; fbox(v, 1, 0, 1, 3, 1, 3, 'darkwood'); fbox(v, 2, 1, 2, 1, 2, 1, 'darkwood'); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) for (let z = 0; z < 5; z++) if ((x - 2) ** 2 + (y - 2) ** 2 + (z - 2) ** 2 <= 5) v.push([x, y + 3, z, (x * 3 + y + z * 2) % 5 < 2 ? 'leaf' : 'sky']); return v; }
function mLibraryHouse() { // the library on the street: pale stone, columns, wide steps
  const v = [], W = 48, D = 36, H = 28;
  fbox(v, -2, 0, -2, W + 4, 1, D + 6, 'stone');
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) { if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue; if (z === D - 1 && x >= 20 && x < 28 && y < 16) continue; v.push([x, y, z, (y % 5 === 0) ? 'white2' : 'libwall']); }
  for (const x of [4, 12, 34, 42]) fbox(v, x, 1, D, 2, H - 2, 2, 'white'); fbox(v, -2, H - 1, D, W + 4, 2, 3, 'white');
  for (let k = 0; k < 10; k++) for (let x = -2 - k; x < W + 2 + k; x++) if (x >= -2 && x < W + 2) v.push([x, H + 1 + k, D - 2 - k * 1 > 0 ? D + 1 : D + 1, 'roofteal']);
  for (let k = 0; k < 9; k++) fbox(v, k * 2, H + 1 + k, 0, W - k * 4, 1, D + 2, 'roofteal');
  fbox(v, 20, 1, D - 1, 8, 15, 1, 'darkwood'); fbox(v, 16, 18, D, 16, 5, 1, 'white'); for (let x = 18; x < 30; x += 3) fbox(v, x, 19, D + 1, 2, 3, 1, 'book2');
  for (let k = 0; k < 3; k++) fbox(v, 16 - k, 0, D + 2 + k, 16 + 2 * k, 1, 1, 'stone2');
  return v;
}

// ---- the post office and the park (B, 15 Nov 2026: "More places") ----
function mShopFront(o) { // a shop that faces the road (its front at z = 0): big window, a door, a sign
  const v = [], W = (o.w || 6) * F, D = 28, H = 26;
  fbox(v, -1, 0, -1, W + 2, 1, D + 2, 'stone');
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) { if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
    if (z === 0 && ((x >= 6 && x < 22 && y >= 6 && y < 16) || (x >= 30 && x < 37 && y < 15))) continue; v.push([x, y, z, y % 5 === 0 ? (o.wall2 || 'white2') : (o.wall || 'white')]); }
  fbox(v, 6, 6, 1, 16, 10, 1, 'glass'); fbox(v, 5, 5, 0, 18, 1, 1, 'white'); fbox(v, 5, 16, 0, 18, 1, 1, 'white');
  fbox(v, 30, 1, 1, 7, 14, 1, o.door || 'sky'); v.push([35, 7, 0, 'sun']);
  fbox(v, -2, H, -2, W + 4, 2, D + 4, o.roof || 'sky'); fbox(v, 8, 18, -1, W - 16, 5, 1, o.sign || 'sky'); fbox(v, 10, 19, -2, W - 20, 3, 1, 'white');
  return v;
}
function mMailslots() { const v = []; for (let x = 0; x < 24; x++) for (let y = 0; y < 16; y++) v.push([x, y, 0, x % 4 === 0 || y % 4 === 0 ? 'wood' : ((x >> 2) + (y >> 2)) % 3 === 0 ? 'white' : 'darkwood']); return v; }
function mMailbox2() { const v = []; fbox(v, 0, 0, 0, 8, 12, 6, 'sky'); for (let x = 0; x < 8; x++) for (let z = 0; z < 6; z++) if ((x - 3.5) ** 2 / 16 + 1 > 0) v.push([x, 12, z, 'sky']); fbox(v, 1, 13, 1, 6, 1, 4, 'sky'); fbox(v, 2, 9, 6, 4, 1, 1, 'ink'); fbox(v, 2, 4, 6, 4, 3, 1, 'white'); fbox(v, 1, -2, 1, 1, 2, 1, 'ink'); fbox(v, 6, -2, 1, 1, 2, 1, 'ink'); return v; }
function mPaper() { const v = []; fbox(v, 0, 0, 0, 5, 1, 6, 'white'); return v; }
function mWriting() { const v = []; for (let z = 1; z < 5; z++) fbox(v, 1, 0, z, 3 - (z === 4 ? 1 : 0), 1, 1, 'ink'); return v; }
function mPencil() { const v = []; fbox(v, 0, 0, 0, 1, 1, 6, 'sun'); v.push([0, 0, 6, 'crust'], [0, 0, -1, 'pink']); return v; }
function mEnvelope(o) { const v = []; fbox(v, 0, 0, 0, 7, 1, 5, 'cream'); if (o.closed) { v.push([3, 1, 2, 'cream2'], [2, 1, 1, 'cream2'], [4, 1, 1, 'cream2']); } return v; }
function mAddress() { const v = []; fbox(v, 2, 0, 2, 3, 1, 1, 'ink'); fbox(v, 2, 0, 3, 2, 1, 1, 'ink'); v.push([0, 0, 0, 'ink'], [1, 0, 0, 'ink']); return v; } // their address in the middle, yours top left
function mStamps() { const v = []; for (let i = 0; i < 3; i++) fbox(v, i * 3, 0, 0, 2, 1, 2, ['pink', 'sky', 'leaf'][i]); return v; }
function mStampOn() { const v = []; fbox(v, 0, 0, 0, 1, 1, 1, 'pink'); return v; }
function mTable2() { const v = []; fbox(v, 0, 8, 0, 20, 1, 12, 'wood'); for (const [x, z] of [[0, 0], [18, 0], [0, 10], [18, 10]]) fbox(v, x, 0, z, 2, 8, 2, 'darkwood'); return v; }
function mShareCard(o) { // a card about something you might share
  const v = []; fbox(v, 0, 0, 0, 6, 1, 5, 'white'); const P = (x, z, c) => v.push([x, 1, z, c]);
  if (o.pic === 'color') { for (let x = 1; x < 5; x++) for (let z = 1; z < 4; z++) P(x, z, 'teal'); }
  else if (o.pic === 'pet') { P(2, 2, 'darkwood'); P(3, 2, 'darkwood'); P(2, 1, 'darkwood'); P(3, 3, 'pink'); P(1, 3, 'darkwood'); P(4, 3, 'darkwood'); }
  else if (o.pic === 'home') { P(1, 2, 'cream'); P(2, 2, 'cream'); P(3, 2, 'cream'); P(2, 1, 'pink'); P(1, 3, 'cream'); P(3, 3, 'cream'); P(4, 4, 'ink'); P(0, 4, 'ink'); }
  else { P(2, 2, 'ink'); P(3, 2, 'ink'); P(2, 3, 'ink'); P(3, 3, 'ink'); P(2, 1, 'stone'); P(3, 1, 'stone'); P(1, 2, 'sun'); }
  return v;
}
function mRobin() { const v = []; fbox(v, 0, 1, 0, 4, 3, 3, 'darkwood'); fbox(v, 3, 1, 0, 1, 2, 3, 'orange'); fbox(v, 3, 4, 1, 2, 2, 2, 'darkwood'); v.push([5, 4, 1, 'sun'], [4, 5, 1, 'ink'], [1, 0, 1, 'sun'], [2, 0, 1, 'sun'], [-1, 2, 1, 'darkwood']); return v; }
function mSquirrel() { const v = []; fbox(v, 0, 0, 0, 3, 4, 3, 'stone2'); fbox(v, 1, 4, 0, 2, 2, 3, 'stone2'); v.push([3, 5, 1, 'ink'], [2, 6, 0, 'stone2'], [2, 6, 2, 'stone2']); fbox(v, -2, 1, 1, 2, 6, 1, 'stone'); fbox(v, -3, 5, 1, 1, 3, 1, 'stone'); v.push([3, 2, 1, 'darkwood']); return v; } // with a bushy tail and a nut
function mBeeSm() { const v = []; fbox(v, 0, 0, 0, 3, 2, 2, 'sun'); v.push([1, 0, 0, 'ink'], [1, 1, 0, 'ink'], [1, 0, 1, 'ink'], [1, 1, 1, 'ink'], [1, 2, 0, 'glass'], [1, 2, 1, 'glass'], [3, 1, 0, 'ink']); return v; }
function mFlowerBed() { const v = []; fbox(v, 0, 0, 0, 20, 2, 8, 'soil'); for (let x = 1; x < 19; x += 3) for (let z = 1; z < 7; z += 3) { fbox(v, x, 2, z, 1, 3, 1, 'leaf'); v.push([x, 5, z, ['pink', 'sun', 'sky', 'white'][(x + z) % 4]], [x - 1, 5, z, 'leaf3'], [x + 1, 5, z, ['pink', 'sun', 'sky', 'white'][(x + z) % 4]]); } return v; }
function mLadybug() { const v = []; fbox(v, 0, 0, 0, 2, 1, 2, 'firered'); v.push([0, 1, 0, 'ink'], [1, 1, 1, 'ink'], [2, 0, 0, 'ink'], [2, 0, 1, 'ink']); fbox(v, -1, -1, -1, 4, 1, 4, 'leaf'); return v; } // on a leaf
function mFrogSm() { const v = []; fbox(v, -1, 0, -1, 5, 1, 4, 'leaf'); fbox(v, 0, 1, 0, 3, 2, 2, 'leaf2'); v.push([0, 3, 1, 'white'], [2, 3, 1, 'white'], [0, 3, 2, 'ink'], [2, 3, 2, 'ink']); return v; } // on a lily pad
function mParkSign() { const v = []; fbox(v, 0, 0, 0, 1, 10, 1, 'darkwood'); fbox(v, -4, 8, 0, 9, 5, 1, 'leaf2'); fbox(v, -3, 9, 1, 7, 3, 1, 'white'); return v; }

// ---- the repair cafe and the town square (B, 15 Nov 2026: "Repair cafe and square") ----
function mShirt(o) { const v = []; fbox(v, 0, 0, 0, 12, 1, 12, o.c || 'sky'); fbox(v, -3, 0, 1, 3, 1, 4, o.c || 'sky'); fbox(v, 12, 0, 1, 3, 1, 4, o.c || 'sky'); fbox(v, 4, 1, 0, 4, 1, 1, 'white'); for (const z of [3, 9]) v.push([6, 1, z, 'white']); return v; } // a shirt laid flat, one button missing at the middle
function mButton() { const v = []; v.push([0, 0, 0, 'pink'], [1, 0, 0, 'pink'], [0, 0, 1, 'pink'], [1, 0, 1, 'pink'], [0, 1, 0, 'ink'], [1, 1, 1, 'ink']); return v; }
function mSpool() { const v = []; fbox(v, 0, 0, 0, 3, 1, 3, 'wood'); fbox(v, 0, 1, 0, 3, 3, 3, 'pink'); fbox(v, 0, 4, 0, 3, 1, 3, 'wood'); return v; }
function mNeedle() { const v = []; fbox(v, 0, 0, 0, 6, 1, 1, 'stone'); v.push([-1, 0, 0, 'stone2']); return v; } // a big blunt practice needle
function mScissors() { const v = []; fbox(v, 0, 0, 0, 2, 1, 2, 'firered'); fbox(v, 3, 0, 0, 2, 1, 2, 'firered'); fbox(v, 2, 0, 2, 1, 1, 4, 'stone'); fbox(v, 3, 0, 2, 1, 1, 4, 'stone'); return v; }
function mThread() { const v = []; for (const [x, z] of [[0, 0], [1, 1], [0, 1], [1, 0]]) v.push([x, 0, z, 'pink2']); return v; }
function mBike() { // a bike on a stand, its back wheel separate (flat or full)
  const v = [], wheel = (cx) => { for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; v.push([Math.round(cx + Math.cos(t) * 5), Math.round(6 + Math.sin(t) * 5), 0, 'ink']); } v.push([cx, 6, 0, 'stone']); };
  wheel(4); for (let i = 0; i < 12; i++) v.push([4 + i, 6 + (i >> 1), 0, 'pink']); for (let i = 0; i < 10; i++) v.push([10 + i, 12, 0, 'pink']); for (let i = 0; i < 7; i++) v.push([16 + (i >> 1), 6 + i, 0, 'pink']);
  fbox(v, 9, 13, -1, 3, 1, 3, 'ink'); fbox(v, 3, 12, -1, 1, 3, 1, 'ink'); fbox(v, 1, 15, -2, 5, 1, 1, 'ink'); fbox(v, 14, 0, -2, 6, 1, 1, 'stone'); fbox(v, 16, 1, -1, 1, 5, 1, 'stone');
  return v;
}
function mWheel(o) { const v = [], r = o.flat ? 4 : 5; for (let a = 0; a < 44; a++) { const t = a / 44 * Math.PI * 2; let y = Math.sin(t) * r; if (o.flat && y < -3) y = -3; v.push([Math.round(Math.cos(t) * 5), Math.round(6 + y), 0, 'ink']); v.push([Math.round(Math.cos(t) * 4), Math.round(6 + y * 0.8), 0, 'ink']); } v.push([0, 6, 0, 'stone']); for (let i = 1; i < 4; i++) v.push([i, 6, 0, 'stone'], [-i, 6, 0, 'stone'], [0, 6 + i, 0, 'stone']); return v; }
function mValve(o) { const v = []; v.push([0, 0, 0, 'stone']); if (o.cap) v.push([0, 1, 0, 'ink']); return v; }
function mPump() { const v = []; fbox(v, 0, 0, 0, 5, 1, 3, 'ink'); fbox(v, 2, 1, 1, 1, 10, 1, 'teal'); fbox(v, 0, 11, 1, 5, 1, 1, 'ink'); fbox(v, 3, 2, 1, 2, 1, 1, 'ink'); return v; }
function mFountain() { const v = []; for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) { const d = x * x + z * z; if (d <= 64) { v.push([x, 0, z, 'stone']); if (d >= 49) v.push([x, 1, z, 'stone'], [x, 2, z, 'stone2']); else v.push([x, 1, z, 'water']); } } fbox(v, -1, 2, -1, 3, 6, 3, 'stone'); for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 9) v.push([x, 8, z, 'stone2']); v.push([0, 9, 0, 'water'], [0, 10, 0, 'water'], [1, 9, 0, 'water'], [-1, 9, 0, 'water']); return v; }
function mSwing() { const v = []; for (const x of [0, 18]) { fbox(v, x, 0, 0, 1, 18, 1, 'firered'); fbox(v, x, 0, 6, 1, 18, 1, 'firered'); } fbox(v, 0, 18, 0, 19, 1, 7, 'firered'); for (const x of [5, 12]) { fbox(v, x, 6, 3, 1, 12, 1, 'stone'); fbox(v, x + 2, 6, 3, 1, 12, 1, 'stone'); fbox(v, x, 5, 2, 3, 1, 3, x === 5 ? 'sun' : 'teal'); } return v; }
function mApplesSpilled() { const v = []; fbox(v, 0, 0, 0, 5, 4, 4, 'bag'); for (const [x, z] of [[6, 1], [8, 3], [7, 6], [10, 2], [4, 6]]) { fbox(v, x, 0, z, 2, 2, 2, 'apple'); } return v; }
function mHeavyBag() { const v = []; fbox(v, 0, 0, 0, 5, 6, 4, 'crust'); fbox(v, 1, 6, 1, 3, 1, 2, 'leaf'); v.push([2, 7, 2, 'orange']); return v; }

// ---- the school and its bus stop (B, 17 Nov 2026: "School and bus stop") ----
function mSchoolBus() { // a yellow school bus, front at high x, its door on the sidewalk side (high z, toward you); stop arm and lights; 8 blocks long
  const v = [], L = 64, W = 20, H = 22;
  for (let x = 0; x < L; x++) for (let y = 3; y < H; y++) for (let z = 0; z < W; z++) {
    if (!(x === 0 || x === L - 1 || z === 0 || z === W - 1 || y === 3 || y === H - 1)) continue;
    if (z === W - 1 && x >= 51 && x < 60 && y < 19) continue; // the open door
    const win = y >= 12 && y < 18 && ((z === 0 || z === W - 1) ? (x % 7 > 1 && x < 50) : x === L - 1 && z > 2 && z < W - 3);
    v.push([x, y, z, win ? 'glass' : y === 9 ? 'ink' : 'sun']);
  }
  fbox(v, L, 3, 1, 2, 4, W - 2, 'ink'); fbox(v, -2, 3, 1, 2, 4, W - 2, 'ink'); // bumpers
  for (const x of [8, 50]) for (const z of [-1, W]) fbox(v, x, 0, z, 7, 7, 1, 'ink'); // wheels
  for (const z of [3, W - 4]) { fbox(v, L, 19, z, 1, 2, 2, 'firered'); fbox(v, -1, 19, z, 1, 2, 2, 'firered'); } // red lights
  fbox(v, 44, 12, W + 1, 4, 4, 1, 'firered'); fbox(v, 47, 13, W, 1, 2, 1, 'stone'); // the stop arm, folded out
  fbox(v, 52, 3, W - 5, 7, 1, 4, 'ink'); fbox(v, 52, 4, W - 3, 7, 1, 2, 'ink'); // the steps up
  return v;
}
function mBusSignHi() { const v = []; fbox(v, 0, 0, 0, 3, 72, 3, 'stone'); fbox(v, -12, 56, 1, 27, 22, 2, 'sun'); fbox(v, -10, 58, 3, 23, 18, 1, 'white');
  fbox(v, -7, 62, 4, 17, 9, 1, 'sun'); fbox(v, -5, 66, 5, 3, 3, 1, 'glass'); fbox(v, 0, 66, 5, 3, 3, 1, 'glass'); fbox(v, 5, 66, 5, 3, 3, 1, 'glass'); fbox(v, -5, 60, 4, 3, 3, 1, 'ink'); fbox(v, 6, 60, 4, 3, 3, 1, 'ink'); return hi(v); } // a bus stop sign: a bus on yellow
function mSafeSpotHi() { // where to wait: a yellow square painted three giant steps back from the curb, with two footprints on it
  const v = []; for (let x = 0; x < 34; x++) for (let z = 0; z < 34; z++) v.push([x, 0, z, x < 2 || x > 31 || z < 2 || z > 31 ? 'ink' : 'sun']);
  for (const fx of [9, 19]) ell(v, fx + 3, 1, 17, 3, 0.5, 7, 'ink'); return hi(v);
}
function mRailHi() { const v = []; fbox(v, 0, 0, 0, 3, 52, 3, 'stone2'); fbox(v, 0, 52, 0, 3, 3, 10, 'stone2'); fbox(v, 0, 0, 0, 3, 3, 10, 'stone2'); return hi(v); } // the handrail by the bus door
function mHooksHi() { const v = []; fbox(v, 0, 0, 0, 104, 10, 3, 'wood'); for (const x of [12, 50, 88]) { fbox(v, x, 3, 3, 4, 4, 8, 'peg'); fbox(v, x - 1, 6, 10, 6, 2, 2, 'peg'); } return hi(v); } // a row of coat hooks on the wall
function mCubbyHi() { // cubbies: an open wooden shelf with three boxes, one for each child's lunch
  const v = []; for (let x = 0; x < 96; x++) for (let y = 0; y < 34; y++) for (let z = 0; z < 26; z++) if (y < 2 || y > 31 || x < 2 || x > 93 || x % 32 < 2 || z < 2) v.push([x, y, z, (x % 32 < 2 || x > 93) ? 'darkwood' : 'wood']);
  for (const [i, c] of [[0, 'pink'], [1, 'teal'], [2, 'sky']]) fbox(v, 10 + i * 32, 28, 26, 12, 3, 1, c); return hi(v);
}
function mTrayHi() { const v = []; for (let x = 0; x < 30; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 22; z++) if (y === 0 || x === 0 || x === 29 || z === 0 || z === 21) v.push([x, y, z, 'teal']); fbox(v, 8, 3, 22, 14, 3, 1, 'white'); return hi(v); } // the teacher's homework tray
function mKidDeskHi() { // a child's desk with its chair tucked behind
  const v = []; fbox(v, 0, 22, 0, 40, 3, 28, 'wood'); for (const [x, z] of [[1, 1], [36, 1], [1, 24], [36, 24]]) fbox(v, x, 0, z, 3, 22, 3, 'stone');
  fbox(v, 8, 12, 30, 24, 2, 18, 'teal'); fbox(v, 8, 14, 46, 24, 18, 2, 'teal'); for (const [x, z] of [[9, 31], [29, 31], [9, 45], [29, 45]]) fbox(v, x, 0, z, 2, 12, 2, 'stone');
  fbox(v, 6, 25, 6, 12, 1, 9, 'white'); fbox(v, 22, 25, 8, 10, 1, 2, 'sun'); return hi(v);
}
function mWhiteboard() { const v = []; fbox(v, 0, 0, 0, 30, 14, 1, 'sky'); fbox(v, 1, 1, 1, 28, 12, 1, 'white'); for (const [x, y, w, c] of [[3, 9, 6, 'pink'], [11, 9, 9, 'ink'], [3, 6, 12, 'teal'], [3, 3, 8, 'ink'], [14, 3, 10, 'sun']]) fbox(v, x, y, 2, w, 1, 1, c); fbox(v, 2, -1, 1, 26, 1, 2, 'stone'); return v; } // a whiteboard with a morning message
function busstop() { // the bus stop by the school: sidewalk, the curb, the road
  const b = [];
  for (let x = 0; x < 14; x++) for (let z = 0; z < 10; z++) b.push([x, 0, z, z > 4 ? ((x + z) % 2 ? 'walk' : 'plaza') : z === 4 ? 'stone' : z === 2 && x % 3 === 1 ? 'line' : 'road']); // the road at the back (a dashed middle line), the curb, the sidewalk in front
  for (let x = 0; x < 14; x++) { b.push([x, 0, -1, 'stone']); for (const z of [-2, -3]) b.push([x, 0, z, (x + z) % 2 ? 'grass' : 'grass2']); } // the far curb and a strip of grass across the road
  return b;
}
function busstopThings() {
  return [
    { id: 'stopsign', model: 'busSignHi', at: [10.8, 1, 5.3] },
    // the morning at the stop before the bus comes: you on the sidewalk, a neighbor and her grown-up already waiting back from the curb
    { id: 'mestart', model: 'kid', opts: { shirt: 'pink', pants: 'ink2b', hair: 'darkwood' }, at: [3.3, 1.03, 8.3], turn: 2 },
    { id: 'buskid', model: 'kid', opts: { shirt: 'teal', pants: 'sky', hair: 'ink' }, at: [8.4, 1.03, 7.4], turn: 2 },
    { id: 'busgrown', model: 'person', opts: { shirt: 'sun', hair: 'stone2' }, at: [9.5, 1.03, 7.9], turn: 2 },
    { id: 'buslamp', model: 'lamp', at: [12.9, 1, 5.4] },
    { id: 'bustree1', model: 'tree', opts: { r: 10, trunk: 14 }, at: [2.2, 1, -2.4] }, { id: 'bustree2', model: 'tree', opts: { r: 12, trunk: 16 }, at: [11.6, 1, -2.4] }, { id: 'busfence', model: 'fence', opts: { len: 14 }, at: [0, 1, -3.4] },
    { id: 'safespot', model: 'safeSpotHi', at: [5.2, 1.01, 6.6] },
    { id: 'mewait', model: 'kid', opts: { shirt: 'pink', pants: 'ink2b', hair: 'darkwood' }, at: [5.73, 1.03, 7.1], turn: 2, hidden: true },
    { id: 'bus', model: 'schoolbus', at: [1.6, 1, 0.6], hidden: true },
    { id: 'driver', model: 'person', opts: { shirt: 'sky', hair: 'ink' }, scale: 0.8, at: [8.6, 1.4, 2.5], hidden: true },
    { id: 'rail', model: 'railHi', at: [7.9, 1.4, 3.15], hidden: true },
    { id: 'bushb', model: 'bush', at: [12.4, 1, 8.2], opts: { r: 5, flowers: 'pink' } },
  ];
}
function school() { // a classroom: soft blue floor, two walls
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (x + z) % 2 ? 'scfloor' : 'scfloor2']);
  for (let x = 0; x < 12; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'sun' : 'scwall']);
  for (let z = 1; z < 9; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'sun' : 'scwall2']);
  return b;
}
function schoolThings() {
  return [
    { id: 'whiteboard', model: 'whiteboard', at: [4.6, 2.3, 1.02] },
    { id: 'hooks', model: 'hooksHi', at: [1.2, 3.3, 1.02] },
    { id: 'cubby', model: 'cubbyHi', at: [8.9, 1, 1.05] },
    { id: 'tdesk', model: 'stand', opts: { w: 2, top: 'wood' }, at: [8.9, 1, 3.4] },
    { id: 'tray', model: 'trayHi', at: [9.6, 2.125, 3.55] },
    { id: 'teacher', model: 'person', opts: { shirt: 'teal', hair: 'darkwood' }, at: [7.6, 1, 2.9] },
    { id: 'mydesk', model: 'kidDeskHi', at: [4.2, 1, 4.6] }, { id: 'desk2', model: 'kidDeskHi', at: [6.2, 1, 4.6] },
    { id: 'desk3', model: 'kidDeskHi', at: [4.2, 1, 6.8] }, { id: 'desk4', model: 'kidDeskHi', at: [6.2, 1, 6.8] },
    { id: 'cbench', model: 'stand', opts: { w: 3, top: 'wood', c: 'wood' }, at: [1.1, 1, 6.6] },
    { id: 'backpack', model: 'backpackHi', at: [1.3, 2.125, 6.8] },
    { id: 'coat', model: 'raincoatHi', at: [2.2, 2.125, 6.75] },
    { id: 'lunch', model: 'lunchBoxHi', at: [3.3, 2.125, 6.85] },
    { id: 'folder', model: 'folderHi', at: [3.3, 2.69, 6.85] },
    // the feelings corner: a rug, a classmate whose tower fell, the calm-down turtle, four feeling faces
    { id: 'feelrug', model: 'feelrug', at: [8.1, 1.005, 5.2] },
    { id: 'pal', model: 'kid', opts: { shirt: 'pink', pants: 'ink2b', hair: 'darkwood', mood: 'sad' }, at: [9.2, 1, 6.0] },
    { id: 'palhappy', model: 'kid', opts: { shirt: 'pink', pants: 'ink2b', hair: 'darkwood' }, at: [9.2, 1, 6.0], hidden: true },
    { id: 'blocksdown', model: 'blocksHi', opts: { down: true }, at: [10.1, 1.01, 5.9] }, { id: 'towerup', model: 'blocksHi', at: [10.2, 1.01, 5.9], hidden: true },
    { id: 'turtle', model: 'turtleHi', scale: 1.3, at: [8.25, 1.01, 6.3] },
    { id: 'facehappy', model: 'faceCardHi', opts: { mood: 'happy' }, at: [8.3, 1.01, 7.7] }, { id: 'facesad', model: 'faceCardHi', opts: { mood: 'sad' }, at: [9.1, 1.01, 7.7] },
    { id: 'facemad', model: 'faceCardHi', opts: { mood: 'mad' }, at: [9.9, 1.01, 7.7] }, { id: 'facescared', model: 'faceCardHi', opts: { mood: 'scared' }, at: [10.7, 1.01, 7.7] },
  ];
}

// ---- the clinic (B, 17 Nov 2026: "Build the clinic first") ----
function mExamTable() { // the exam table: a padded top with a strip of paper, a step in front; 3 blocks wide
  const v = []; fbox(v, 0, 0, 0, 24, 6, 12, 'white2'); fbox(v, 0, 6, 0, 24, 2, 12, 'teal'); fbox(v, 2, 8, 2, 20, 1, 8, 'white'); fbox(v, 0, 8, 0, 6, 3, 12, 'teal');
  fbox(v, 9, 0, 12, 6, 3, 3, 'stone'); return v;
}
function mHeightChart() { const v = [], c = ['pink', 'sun', 'teal', 'sky']; fbox(v, 0, 0, 0, 20, 88, 1, 'white'); for (let y = 0; y < 88; y++) { fbox(v, 0, y, 1, 4, 1, 1, c[(y >> 4) % 4]); if (y % 8 === 0) fbox(v, 4, y, 1, y % 16 === 0 ? 10 : 6, 1, 1, 'ink'); } return hi(v); } // a height chart on the wall: color bands, a tick at every step
function mScaleHi() { const v = []; fbox(v, 0, 0, 0, 26, 3, 26, 'stone2'); fbox(v, 2, 3, 2, 22, 1, 22, 'ink2b'); fbox(v, 9, 3, 18, 8, 1, 6, 'white'); fbox(v, 12, 4, 20, 2, 1, 2, 'firered'); return hi(v); } // a floor scale with a little window
function mStethHi() { const v = []; for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; v.push([Math.round(14 + Math.cos(t) * 11), 0, Math.round(12 + Math.sin(t) * 9), 'ink']); } fbox(v, 3, 0, 20, 2, 2, 8, 'ink'); fbox(v, 22, 0, 20, 2, 2, 8, 'ink'); ell(v, 14, 1, 2, 4, 1.5, 4, 'stone'); ell(v, 14, 1, 2, 2, 2, 2, 'stone2'); return hi(v); } // a stethoscope, lying in a loop
function mEarLightHi() { const v = []; fbox(v, 0, 0, 0, 5, 18, 5, 'ink'); fbox(v, -1, 18, -1, 7, 7, 7, 'stone'); fbox(v, 1, 21, 6, 3, 3, 4, 'white'); v.push([2, 22, 10, 'sun']); return hi(v); } // the little ear light
function mFirstAidHi() { const v = []; fbox(v, 0, 0, 0, 30, 18, 16, 'white'); fbox(v, 0, 18, 0, 30, 2, 16, 'white2'); fbox(v, 12, 8, 16, 6, 14 - 6 + 6, 1, 'leaf2'); fbox(v, 8, 12, 16, 14, 6, 1, 'leaf2'); fbox(v, 11, 20, 6, 8, 3, 2, 'ink'); return hi(v); } // a first aid kit: white, a green cross
function mClothHi() { const v = []; fbox(v, 0, 0, 0, 24, 4, 16, 'white'); fbox(v, 0, 2, 0, 24, 1, 16, 'white2'); fbox(v, 0, 4, 6, 24, 1, 3, 'sky'); return hi(v); } // a clean cloth, folded
function mBandageBoxHi() { const v = []; fbox(v, 0, 0, 0, 20, 14, 10, 'sky'); fbox(v, 3, 5, 10, 14, 5, 1, 'bread'); fbox(v, 8, 6, 11, 4, 3, 1, 'crust'); return hi(v); } // a box of bandages
function mScrapeHi() { const v = []; fbox(v, 0, 0, 0, 5, 3, 1, 'firered'); v.push([1, 3, 0, 'firered'], [3, -1, 0, 'firered']); return hi(v); } // a little scrape on the knee
function mBandageOnHi() { const v = []; fbox(v, -2, 0, 0, 10, 4, 1, 'bread'); fbox(v, 1, 1, 1, 4, 2, 1, 'crust'); return hi(v); } // a bandage over it
function clinic() { // the clinic: a calm mint floor, two walls
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (x + z) % 2 ? 'clfloor' : 'clfloor2']);
  for (let x = 0; x < 12; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'teal' : 'clwall']);
  for (let z = 1; z < 9; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'teal' : 'clwall2']);
  return b;
}
function clinicThings() {
  return [
    // a small cut: the counter with its sink, the first aid things, the nurse, and you with a scraped knee
    { id: 'counter', model: 'counter', opts: { w: 4, sink: 14 }, at: [1.2, 1, 1] },
    { id: 'faucet', model: 'faucetHi', at: [3.3, 2.25, 1.05] },
    { id: 'stream', model: 'streamHi2', opts: { h: 23 }, at: [3.39, 1.875, 1.47], hidden: true },
    { id: 'kit', model: 'firstAidHi', at: [1.35, 2.25, 1.15] },
    { id: 'cloth', model: 'clothHi', at: [3.95, 2.25, 1.85] },
    { id: 'bandages', model: 'bandageBoxHi', at: [4.6, 2.25, 1.2] },
    { id: 'nurse', model: 'person', opts: { shirt: 'teal', hair: 'darkwood' }, at: [6.3, 1, 1.7] },
    { id: 'me', model: 'kid', opts: { shirt: 'pink', pants: 'sky', hair: 'darkwood' }, at: [3.6, 1, 3.7] },
    { id: 'scrape', model: 'scrapeHi', scale: 1.4, at: [3.33, 1.28, 3.84] },
    { id: 'bandageon', model: 'bandageOnHi', scale: 1.4, at: [3.33, 1.27, 3.86], hidden: true },
    // a checkup: the exam table, the height chart, the scale, the doctor's tools
    { id: 'examtable', model: 'examtable', at: [7.4, 1, 1.15] },
    { id: 'steth', model: 'stethHi', at: [7.9, 2.32, 1.55] },
    { id: 'earlight', model: 'earLightHi', at: [9.0, 2.32, 1.6] },
    { id: 'chart', model: 'heightchart', at: [10.6, 1, 1.02] },
    { id: 'scale', model: 'scaleHi', at: [10.4, 1, 2.2] },
    { id: 'doctor', model: 'person', opts: { shirt: 'white', apron: 'sky', hair: 'hair' }, at: [8.4, 1, 3.6] },
  ];
}

// ---- the bakery (B, 17 Nov 2026: "Build the bakery next") ----
function bowlShell(v, w, h, k) { const r = w / 2; for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) for (let y = 0; y < h; y++) { const d = Math.hypot(x - r + 0.5, z - r + 0.5), rr = r * (0.55 + 0.45 * y / h); if (d <= rr && (d > rr - 2.2 || y === 0)) v.push([x, y, z, k]); } }
function mMixBowlHi() { const v = []; bowlShell(v, 30, 14, 'sky'); return hi(v); } // a big mixing bowl
function mFlourBagHi() { const v = []; fbox(v, 0, 0, 0, 18, 24, 12, 'white'); fbox(v, 1, 24, 1, 16, 3, 10, 'white2'); fbox(v, 4, 8, 12, 10, 8, 1, 'sun'); fbox(v, 6, 10, 13, 6, 4, 1, 'bread'); return hi(v); } // a bag of flour with a wheat sign
function mFill(o) { const v = [], r = 12; for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) { const d = Math.hypot(x - 14.5, z - 14.5); if (d < r) { const top = Math.round((o.h || 3) * (1 - (d / r) ** 2)); for (let y = 0; y <= top; y++) v.push([x, y, z, o.k]); } } if (o.yolk) ell(v, 18, (o.h || 3) + 1, 12, 3.5, 1.5, 3.5, 'sun'); return v; }
function mFlourInHi() { return hi(mFill({ k: 'white', h: 5 })); } // flour in the bowl
function mEggInHi() { return hi(mFill({ k: 'white', h: 5, yolk: true })); } // an egg on top of the flour
function mBatterHi() { return hi(mFill({ k: 'bread', h: 6 })); } // stirred batter
function mMuffinPanHi(o) { const v = []; fbox(v, 0, 0, 0, 48, 2, 32, 'stone'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const cx = 8 + i * 16, cz = 8 + j * 16; for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (x * x + z * z <= 36) { v.push([cx + x, 2, cz + z, x * x + z * z > 25 ? 'stone2' : (o.full ? 'bread' : 'white2')]); if (o.full && x * x + z * z < 20) v.push([cx + x, 3, cz + z, 'bread']); } } return hi(v); } // a muffin pan: six paper cups (o.full: batter in them)
function mMuffinsHi() { const v = []; fbox(v, 0, 0, 0, 48, 1, 32, 'ink'); for (let x = 0; x < 48; x += 6) fbox(v, x, 1, 0, 1, 1, 32, 'stone'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const cx = 8 + i * 16, cz = 8 + j * 16; fbox(v, cx - 5, 2, cz - 5, 11, 6, 11, (i + j) % 2 ? 'pink' : 'sky'); ell(v, cx, 9, cz, 6.5, 4, 6.5, 'crust'); v.push([cx - 2, 12, cz, 'darkwood'], [cx + 2, 11, cz + 2, 'darkwood']); } return hi(v); } // six muffins cooling on a rack
function mCookieHi() { const v = []; for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) if ((x - 5.5) ** 2 + (z - 5.5) ** 2 <= 30) v.push([x, 0, z, 'bread'], [x, 1, z, ((x * 7 + z * 3) % 9 === 0) ? 'darkwood' : 'crust']); return hi(v); } // a cookie with chips
function mBreadRackHi() { const v = []; fbox(v, 0, 0, 0, 3, 80, 3, 'darkwood'); fbox(v, 93, 0, 0, 3, 80, 3, 'darkwood'); for (const y of [24, 50, 76]) fbox(v, 0, y, 0, 96, 3, 24, 'wood');
  for (const [x, y, k] of [[6, 27, 'crust'], [36, 27, 'bread'], [66, 27, 'crust'], [10, 53, 'bread'], [44, 53, 'crust'], [70, 53, 'bread']]) { ell(v, x + 11, y + 6, 12, 11, 6, 8, k); for (let i = 0; i < 3; i++) fbox(v, x + 5 + i * 5, y + 11, 8, 2, 1, 8, 'bread'); } return hi(v); } // a rack of fresh loaves
function bakery() { // the bakery: warm tiles, two walls
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (x + z) % 2 ? 'bkfloor' : 'bkfloor2']);
  for (let x = 0; x < 12; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'pink' : 'bkwall']);
  for (let z = 1; z < 9; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'pink' : 'bkwall2']);
  return b;
}
function bakeryThings() {
  const plate = (i) => [7.1 + i * 0.95, 2.13, 5.75], cookie = (i, n) => { const p = plate(i); return [p[0] + 0.2 + n * 0.22, p[1] + 0.05 + n * 0.07, p[2] + 0.2]; };
  const out = [
    { id: 'counter', model: 'counter', opts: { w: 4, sink: 14 }, at: [1.2, 1, 1] },
    { id: 'faucet', model: 'faucetHi', at: [3.3, 2.25, 1.05] },
    { id: 'stream', model: 'streamHi2', opts: { h: 23 }, at: [3.39, 1.875, 1.47], hidden: true },
    { id: 'oven', model: 'stove', at: [5.6, 1, 1.05] },
    { id: 'baker', model: 'person', opts: { shirt: 'white', apron: 'pink', hair: 'hair' }, at: [7.6, 1, 2.0] },
    { id: 'muffins', model: 'muffinsHi', at: [4.15, 2.25, 1.15], hidden: true },
    { id: 'loaves', model: 'breadRackHi', at: [8.6, 1, 1.05] },
    // the work table: flour, eggs, milk, a bowl and a spoon, the muffin pan
    { id: 'island', model: 'counter', opts: { w: 4, d: 2 }, at: [1.4, 1, 3.6] },
    { id: 'flour', model: 'flourBagHi', at: [1.55, 2.25, 3.75] },
    { id: 'eggs', model: 'eggBoxHi', at: [2.3, 2.25, 3.75] },
    { id: 'milk', model: 'milkHi', at: [3.6, 2.25, 3.75] },
    { id: 'bowl', model: 'mixBowlHi', at: [1.75, 2.25, 4.6] },
    { id: 'flourin', model: 'flourInHi', at: [1.75, 2.3, 4.6], hidden: true },
    { id: 'eggin', model: 'eggInHi', at: [1.75, 2.3, 4.6], hidden: true },
    { id: 'batter', model: 'batterHi', at: [1.75, 2.3, 4.6], hidden: true },
    { id: 'spoon', model: 'spoonHi', scale: 1.6, at: [2.95, 2.25, 4.75] },
    { id: 'pan', model: 'muffinPanHi', at: [3.7, 2.25, 4.45] }, { id: 'panfull', model: 'muffinPanHi', opts: { full: true }, at: [3.7, 2.26, 4.45], hidden: true },
    // sharing: four friends at a table, a plate each, eight cookies to deal out
    { id: 'sharetable', model: 'stand', opts: { w: 4, top: 'wood' }, at: [6.9, 1, 5.5] },
  ];
  const shirts = ['sun', 'teal', 'sky', 'orange'], hair = ['darkwood', 'hair', 'ink', 'darkwood'];
  for (let i = 0; i < 4; i++) {
    out.push({ id: 'friend' + (i + 1), model: 'kid', opts: { shirt: shirts[i], hair: hair[i] }, at: [7.5 + i * 0.95, 1, 5.0] });
    out.push({ id: 'plate' + (i + 1), model: 'plateHi', scale: 0.7, at: plate(i) });
    for (let n = 0; n < 2; n++) out.push({ id: 'c' + (i + 1) + (n + 1), model: 'cookieHi', at: cookie(i, n), hidden: true });
  }
  return out;
}

// ---- the farm stand (B, 17 Nov 2026: "Build the farm stand") ----
function mBeetHi() { const v = []; ell(v, 8, 8, 8, 7.5, 7, 7.5, 'beet'); fbox(v, 7, 0, 7, 2, 2, 2, 'beet'); for (const [x, z] of [[5, 7], [8, 9], [11, 7]]) fbox(v, x, 15, z, 2, 9, 2, 'leaf2'); ell(v, 8, 25, 8, 6, 3, 4, 'leaf'); return hi(v); } // a beet: a round red root with leaves
function mCabbageHi() { const v = []; for (let x = 0; x < 22; x++) for (let y = 0; y < 18; y++) for (let z = 0; z < 22; z++) { const d = (x - 10.5) ** 2 + (y - 9) ** 2 * 1.2 + (z - 10.5) ** 2; if (d <= 110) v.push([x, y, z, d > 90 ? 'leaf2' : (x + y + z) % 5 === 0 ? 'leaf' : 'leaf3']); } return hi(v); } // a round cabbage head of leaves
function mTomatoHi() { const v = []; ell(v, 8, 7, 8, 8, 7, 8, 'firered'); fbox(v, 5, 14, 7, 7, 1, 2, 'leaf2'); fbox(v, 7, 14, 5, 2, 1, 7, 'leaf2'); fbox(v, 7, 15, 7, 2, 2, 2, 'leaf2'); return hi(v); } // a red tomato with its green top
function mPumpkinHi() { const v = []; for (let x = 0; x < 28; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 28; z++) { const d = (x - 13.5) ** 2 + (y - 10) ** 2 * 1.8 + (z - 13.5) ** 2; if (d <= 180) v.push([x, y, z, Math.abs(Math.atan2(z - 13.5, x - 13.5)) % 0.8 < 0.12 ? 'orange2' : 'orange']); } fbox(v, 12, 20, 12, 3, 6, 3, 'darkwood'); return hi(v); } // a pumpkin with ridges and a stem
function mCarrotBunchHi(o) { const v = []; for (let i = 0; i < 3; i++) for (const p of mCarrotHi()) if (p[0] < 28) v.push([p[0], p[1] + (i === 1 ? 4 : 0), p[2] + i * 9, o.clean ? p[3] : ((p[0] * 3 + p[2]) % 5 === 0 ? 'soil2' : p[3])]); return hi(v); } // three carrots: muddy from the ground, or washed clean
function mPartBinHi(o) { // a crate with a picture sign: the root, the leaf, or the fruit (with seeds inside)
  const v = []; for (let x = 0; x < 44; x++) for (let y = 0; y < 22; y++) for (let z = 0; z < 32; z++) if (y === 0 || x === 0 || x === 43 || z === 0 || z === 31) v.push([x, y, z, y % 7 === 6 ? 'darkwood' : 'wood']);
  fbox(v, 8, 1, 32, 28, 20, 1, 'white'); fbox(v, 8, 1, 33, 28, 1, 1, 'ink'); fbox(v, 8, 20, 33, 28, 1, 1, 'ink');
  if (o.kind === 'root') { for (let y = 0; y < 10; y++) fbox(v, 20 - Math.floor(y / 3), 3 + y, 33, 3 + Math.floor(y / 1.6), 1, 1, 'soil2'); fbox(v, 12, 13, 33, 20, 1, 1, 'leaf2'); for (const x of [16, 22, 27]) fbox(v, x, 14, 33, 2, 5, 1, 'leaf'); }
  if (o.kind === 'leaf') { for (let y = 0; y < 14; y++) { const w = Math.round(9 * Math.sin(Math.PI * y / 14)); fbox(v, 22 - w, 4 + y, 33, 2 * w + 1, 1, 1, 'leaf'); } fbox(v, 22, 4, 34, 1, 14, 1, 'leaf2'); }
  if (o.kind === 'fruit') { for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) if (x * x + y * y <= 64) v.push([22 + x, 11 + y, 33, x * x + y * y <= 20 && (x + y) % 3 === 0 ? 'cream' : 'firered']); }
  return hi(v);
}
function mScrubBrushHi() { const v = []; fbox(v, 0, 3, 0, 22, 4, 10, 'wood'); for (let x = 1; x < 21; x += 2) for (let z = 1; z < 10; z += 2) fbox(v, x, 0, z, 1, 3, 1, 'sun'); return hi(v); } // a vegetable brush
function mTubHi() { const v = []; for (let x = 0; x < 48; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 34; z++) if (y === 0 || x < 2 || x > 45 || z < 2 || z > 31) v.push([x, y, z, y > 13 ? 'stone2' : 'stone']); fbox(v, 2, 1, 2, 44, 3, 30, 'water'); return hi(v); } // a washing tub with a little water
function mPost() { const v = []; fbox(v, 0, 0, 0, 2, 7, 2, 'darkwood'); return v; } // a short wooden post
function mFarmStand() { // the farm stand itself: a wooden counter, crates of produce on show, a striped awning on posts
  const v = []; fbox(v, 0, 0, 0, 40, 7, 10, 'wood'); fbox(v, -1, 7, -1, 42, 1, 12, 'darkwood');
  for (const x of [0, 38]) fbox(v, x, 8, 0, 2, 18, 2, 'darkwood'); for (let x = -2; x < 42; x++) for (let z = -2; z < 14; z++) v.push([x, 26 + Math.floor((z + 2) / 6), z, Math.floor((x + 2) / 4) % 2 ? 'white' : 'pink']);
  const crates = [['apple', 2], ['orange', 13], ['leaf', 24], ['egg', 33]]; for (const [k, x] of crates) { fbox(v, x, 8, 2, 7, 3, 6, 'wood'); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) v.push([x + 1 + i * 2, 11, 3 + j * 3, k]); }
  fbox(v, 12, 20, 10, 16, 5, 1, 'white'); fbox(v, 14, 22, 11, 12, 1, 1, 'leaf2'); return v;
}
function farmstand() { // the farm stand at the edge of a field: grass, a dirt path, a row of crops at the back
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, z === 0 ? 'soil' : (x === 6 || x === 7) && z > 2 ? 'path2' : (x + z) % 2 ? 'grass' : 'grass2']);
  return b;
}
function farmstandThings() {
  const crop = (id, model, x, scale) => ({ id, model, scale: scale || 1, at: [x, 2.13, 3.75] });
  return [
    { id: 'stand', model: 'farmstand', at: [2.5, 1, 0.6] },
    { id: 'farmer', model: 'person', opts: { shirt: 'leaf2', apron: 'sky', hair: 'darkwood' }, at: [8.4, 1, 1.6] },
    // sorting: six foods on the cart, three crates by the part of the plant we eat
    { id: 'cart', model: 'stand', opts: { w: 5, top: 'wood' }, at: [0.9, 1, 3.5] },
    crop('carrot', 'carrotHi', 1.0), crop('beet', 'beetHi', 2.0), crop('lettuce', 'lettuceHi', 2.6), crop('cabbage', 'cabbageHi', 3.4), crop('tomato', 'tomatoHi', 4.2), crop('pumpkin', 'pumpkinHi', 4.85),
    { id: 'rootbin', model: 'partBinHi', opts: { kind: 'root' }, at: [0.9, 1, 6.0] },
    { id: 'leafbin', model: 'partBinHi', opts: { kind: 'leaf' }, at: [2.65, 1, 6.0] },
    { id: 'fruitbin', model: 'partBinHi', opts: { kind: 'fruit' }, at: [4.4, 1, 6.0] },
    // washing: a tub with a tap, muddy carrots, a brush and a clean cloth
    { id: 'tub', model: 'tubHi', at: [8.2, 1, 4.9] },
    { id: 'tappost', model: 'post', at: [8.75, 1, 4.6] },
    { id: 'spigot', model: 'faucetHi', at: [8.7, 1.85, 4.66] },
    { id: 'stream', model: 'streamHi2', opts: { h: 18 }, at: [8.79, 1.12, 5.08], hidden: true },
    { id: 'carrots', model: 'carrotBunchHi', at: [8.5, 1.15, 4.98] },
    { id: 'carrotsclean', model: 'carrotBunchHi', opts: { clean: true }, at: [8.5, 1.15, 4.98], hidden: true },
    { id: 'washstand', model: 'stand', opts: { w: 2, top: 'wood' }, at: [10.0, 1, 5.1] },
    { id: 'brush', model: 'scrubBrushHi', at: [10.15, 2.13, 5.3] },
    { id: 'cloth', model: 'clothHi', at: [10.95, 2.13, 5.3] },
  ];
}

// ---- the neighbors' homes on Home Lane (B, 17 Nov 2026: "Build neighbor houses") ----
function mDogHi() { // a friendly dog, sitting: brown with a light chest, floppy ears, a red collar, a wagging tail
  const v = []; ell(v, 16, 12, 12, 9, 11, 8, 'darkwood'); ell(v, 16, 13, 19, 5, 7, 2, 'bread');
  for (const x of [10, 19]) fbox(v, x, 0, 16, 4, 8, 4, 'darkwood'); for (const x of [8, 21]) fbox(v, x, 0, 6, 4, 5, 10, 'darkwood');
  fbox(v, 9, 22, 9, 14, 12, 12, 'darkwood'); fbox(v, 12, 22, 20, 8, 6, 5, 'bread'); fbox(v, 14, 26, 25, 4, 2, 1, 'ink'); fbox(v, 15, 22, 25, 2, 2, 1, 'pink');
  fbox(v, 11, 30, 21, 2, 2, 1, 'ink'); fbox(v, 19, 30, 21, 2, 2, 1, 'ink'); v.push([11, 31, 22, 'white'], [19, 31, 22, 'white']);
  fbox(v, 6, 22, 11, 3, 11, 6, 'ink2b'); fbox(v, 23, 22, 11, 3, 11, 6, 'ink2b');
  fbox(v, 9, 20, 9, 14, 2, 12, 'firered'); fbox(v, 15, 18, 20, 2, 2, 1, 'sun');
  fbox(v, 15, 6, 0, 3, 3, 4, 'darkwood'); fbox(v, 15, 8, -3, 3, 7, 3, 'darkwood');
  return hi(v);
}
function mLeashOnHi() { const v = []; for (let i = 0; i < 26; i++) v.push([16 + Math.round(i * 0.55), 21 + Math.round(i * 0.9), 21 + Math.round(Math.sin(i / 5) * 2), 'firered']); fbox(v, 28, 43, 18, 6, 6, 2, 'firered'); return hi(v); } // the leash, clipped to the collar
function mLeashHi() { const v = []; fbox(v, 0, 0, 0, 6, 4, 2, 'stone'); for (let i = 0; i < 30; i++) v.push([2 + Math.round(Math.sin(i / 4) * 3), -1 - i, 2, 'firered']); fbox(v, -1, -34, 1, 7, 6, 2, 'firered'); return hi(v); } // a red leash on its hook
function mPetBowlHi(o) { const v = []; bowlShell(v, 18, 6, o.c || 'teal'); if (o.water) fbox(v, 4, 3, 4, 10, 1, 10, 'water'); if (o.food) for (let x = 4; x < 14; x++) for (let z = 4; z < 14; z++) if ((x + z) % 2) v.push([x, 4, z, (x * z) % 3 ? 'crust' : 'darkwood']); return hi(v); } // a pet bowl (o.water / o.food filled)
function mDogFoodHi() { const v = []; fbox(v, 0, 0, 0, 20, 30, 10, 'leaf2'); fbox(v, 0, 30, 1, 20, 3, 8, 'leaf'); fbox(v, 4, 12, 10, 12, 10, 1, 'white'); ell(v, 10, 17, 11, 3, 3, 0.5, 'darkwood'); fbox(v, 8, 6, 10, 4, 2, 1, 'crust'); return hi(v); } // a bag of dog food with a measuring scoop line
function mBagRollHi() { const v = []; fbox(v, 3, 12, -1, 6, 3, 8, 'stone'); fbox(v, 5, 6, -1, 2, 7, 2, 'stone'); ell(v, 6, 6, 6, 6, 6, 6, 'leaf'); fbox(v, 4, 4, 11, 4, 4, 2, 'leaf2'); fbox(v, 5, 0, 12, 3, 4, 1, 'leaf'); return hi(v); } // a roll of bags for picking up after the dog
function mCouch() { const v = []; fbox(v, 0, 0, 0, 24, 4, 9, 'teal2'); fbox(v, 0, 4, 0, 24, 6, 3, 'teal2'); fbox(v, 0, 4, 0, 3, 3, 9, 'teal2'); fbox(v, 21, 4, 0, 3, 3, 9, 'teal2'); fbox(v, 3, 4, 3, 18, 1, 6, 'teal'); fbox(v, 5, 5, 3, 4, 4, 2, 'sun'); return v; } // a couch with a cushion
function mGarmentHi(o) { // a piece of clothing, folded flat: o.kind shirt, pants or towel; o.c its color
  const v = [], c = o.c; if (o.kind === 'pants') { fbox(v, 0, 0, 0, 16, 3, 30, c); fbox(v, 0, 3, 0, 16, 1, 4, c); fbox(v, 7, 0, 8, 2, 4, 22, 'ink2b'); fbox(v, 2, 4, 1, 3, 1, 2, 'sun'); }
  else if (o.kind === 'towel') { fbox(v, 0, 0, 0, 24, 5, 18, c); for (let x = 0; x < 24; x += 4) fbox(v, x, 5, 0, 2, 1, 18, o.c2 || 'white2'); }
  else { fbox(v, 0, 0, 0, 24, 3, 20, c); fbox(v, 8, 3, 0, 8, 1, 4, o.c2 || c); fbox(v, -4, 0, 2, 4, 2, 8, c); fbox(v, 24, 0, 2, 4, 2, 8, c); }
  return hi(v);
}
function mSockHi(o) { const v = []; fbox(v, 0, 0, 0, 6, 2, 20, o.c); fbox(v, 0, 0, 20, 12, 2, 6, o.c); fbox(v, 0, 2, 0, 6, 1, 3, 'white'); if (o.stripe) for (let z = 4; z < 20; z += 4) fbox(v, 0, 2, z, 6, 1, 1, o.stripe); fbox(v, 9, 2, 21, 3, 1, 5, o.toe || o.c); return hi(v); } // a sock, lying flat
function mWasherHi() { const v = []; fbox(v, 0, 0, 0, 36, 40, 30, 'white'); fbox(v, 0, 34, 30, 36, 6, 1, 'white2'); fbox(v, 4, 36, 31, 8, 2, 1, 'sky'); for (let x = 22; x < 32; x += 4) fbox(v, x, 36, 31, 2, 2, 1, 'ink');
  for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) { const d = x * x + y * y; if (d <= 144) v.push([18 + x, 16 + y, 30, d > 100 ? 'stone' : 'glass']); } return hi(v); } // a washing machine with a round glass door
function mLaundryBasketHi(o) { const v = []; for (let x = 0; x < 40; x++) for (let y = 0; y < 22; y++) for (let z = 0; z < 28; z++) if (y === 0 || x === 0 || x === 39 || z === 0 || z === 27) v.push([x, y, z, (x + y + z) % 4 < 2 ? 'bread' : 'crust']);
  fbox(v, 10, 4, 28, 20, 14, 1, 'white'); fbox(v, 12, 6, 29, 16, 10, 1, o.dark ? 'ink2b' : 'white2'); fbox(v, 12, 6, 30, 16, 1, 1, 'ink'); return hi(v); } // a laundry basket with a sign: a light square, or a dark one
function pethouse() { // the neighbor's front room: wood floor, two walls
  const b = [];
  for (let x = 0; x < 11; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, z % 2 ? 'floor' : 'floor2']);
  for (let x = 0; x < 11; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'base' : 'hwall']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'base' : 'hwall2']);
  return b;
}
function pethouseThings() {
  return [
    { id: 'couch', model: 'couch', at: [1.2, 1, 1.1] },
    { id: 'neighbor2', model: 'person', opts: { shirt: 'pink', hair: 'stone2' }, at: [5.2, 1, 2.2] },
    { id: 'dog', model: 'dogHi', scale: 1.35, at: [4.75, 1, 3.6] },
    { id: 'leashon', model: 'leashOnHi', scale: 1.35, at: [4.75, 1, 3.6], hidden: true },
    { id: 'leash', model: 'leashHi', at: [8.6, 3.3, 1.05] },
    { id: 'waterbowl', model: 'petBowlHi', opts: { c: 'sky' }, at: [7.1, 1, 4.4] }, { id: 'water', model: 'petBowlHi', opts: { c: 'sky', water: true }, at: [7.1, 1.002, 4.4], hidden: true },
    { id: 'foodbowl', model: 'petBowlHi', opts: { c: 'pink' }, at: [7.9, 1, 4.4] }, { id: 'kibble', model: 'petBowlHi', opts: { c: 'pink', food: true }, at: [7.9, 1.002, 4.4], hidden: true },
    { id: 'foodbag', model: 'dogFoodHi', at: [8.8, 1, 3.4] },
    { id: 'bags', model: 'bagRollHi', at: [9.3, 2.3, 1.1] },
    { id: 'window', model: 'window', at: [3.6, 2.2, 1] },
  ];
}
function laundry() { // the neighbor's laundry room: tiles, two walls
  const b = [];
  for (let x = 0; x < 11; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, (x + z) % 2 ? 'tile' : 'tile2']);
  for (let x = 0; x < 11; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'sky' : 'lwall3']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'sky' : 'lwall4']);
  return b;
}
function laundryThings() {
  const g = (id, kind, c, x, z, c2) => ({ id, model: 'garmentHi', opts: { kind, c, c2 }, at: [x, 1.01, z] });
  return [
    { id: 'washer', model: 'washerHi', at: [1.3, 1, 1.05] }, { id: 'dryer', model: 'washerHi', at: [2.6, 1, 1.05] },
    { id: 'neighbor3', model: 'person', opts: { shirt: 'sun', hair: 'ink' }, at: [8.8, 1, 1.9] },
    { id: 'lightbasket', model: 'laundryBasketHi', at: [4.2, 1, 1.4] }, { id: 'darkbasket', model: 'laundryBasketHi', opts: { dark: true }, at: [5.8, 1, 1.4] },
    // the pile to sort
    g('whiteshirt', 'shirt', 'white', 2.4, 4.2, 'white2'), g('creamtowel', 'towel', 'cream', 3.6, 4.8), g('yellowshirt', 'shirt', 'sun', 4.6, 4.2),
    g('jeans', 'pants', 'sky2', 5.6, 4.0), g('blackshirt', 'shirt', 'ink2b', 6.4, 4.9), g('navytowel', 'towel', 'ink', 7.4, 4.3, 'ink2b'),
    // socks to match, on the folding table
    { id: 'foldtable', model: 'stand', opts: { w: 3, top: 'wood' }, at: [7.4, 1, 6.2] },
    { id: 'redsock1', model: 'sockHi', opts: { c: 'firered' }, at: [7.6, 2.13, 6.35] }, { id: 'bluesock1', model: 'sockHi', opts: { c: 'sky' }, at: [8.4, 2.13, 6.35] }, { id: 'stripesock1', model: 'sockHi', opts: { c: 'white', stripe: 'pink', toe: 'pink' }, at: [9.2, 2.13, 6.35] },
    { id: 'stripesock2', model: 'sockHi', opts: { c: 'white', stripe: 'pink', toe: 'pink' }, at: [3.0, 1.01, 6.6] }, { id: 'redsock2', model: 'sockHi', opts: { c: 'firered' }, at: [4.2, 1.01, 6.4] }, { id: 'bluesock2', model: 'sockHi', opts: { c: 'sky' }, at: [5.4, 1.01, 6.6] },
  ];
}

// ---- the feelings corner (B, 18 Nov 2026: "yes build the feelings corner"; PEOPLE-SKILLS.md #1) ----
function mFaceCardHi(o) { // a standing card with one feeling face: o.mood happy, sad, mad or scared
  const v = [], m = o.mood, bg = { happy: 'leaf', sad: 'sky2', mad: 'firered', scared: 'pink' }[m] || 'white';
  fbox(v, 0, 0, 0, 24, 2, 6, 'wood'); fbox(v, 0, 2, 2, 24, 24, 2, bg);
  for (let x = -9; x <= 9; x++) for (let y = -9; y <= 9; y++) if (x * x + y * y <= 81) v.push([12 + x, 14 + y, 4, 'sun']);
  const p = (x, y, k) => v.push([x, y, 5, k || 'ink']);
  if (m === 'scared') { for (const ex of [7, 15]) { fbox(v, ex, 15, 5, 3, 3, 1, 'white'); p(ex + 1, 16); } for (const [x, y] of [[11, 7], [12, 7], [13, 7], [10, 8], [14, 8], [10, 9], [14, 9], [11, 10], [12, 10], [13, 10]]) p(x, y); }
  else { for (const ex of [8, 15]) fbox(v, ex, 15, 5, 2, 2, 1, 'ink'); }
  if (m === 'happy') { for (let x = 9; x <= 15; x++) p(x, 9); p(8, 10); p(16, 10); }
  if (m === 'sad') { for (let x = 9; x <= 15; x++) p(x, 9); p(8, 8); p(16, 8); for (let y = 11; y <= 13; y++) p(8, y, 'sky'); }
  if (m === 'mad') { for (let x = 9; x <= 15; x++) p(x, 9); for (const [x, y] of [[6, 20], [7, 19], [8, 18], [9, 18], [18, 20], [17, 19], [16, 18], [15, 18]]) p(x, y); }
  return hi(v);
}
function mBlocksHi(o) { // toy blocks: a tall tower, or (o.down) the same blocks tumbled on the floor
  const v = [], c = ['firered', 'sun', 'teal', 'sky', 'pink', 'leaf'], cube = (x, y, z, k) => fbox(v, x, y, z, 8, 8, 8, k);
  if (o.down) [[0, 0, 0], [10, 0, 2], [3, 0, 11], [16, 0, 9], [7, 8, 4], [20, 0, 0]].forEach(([x, y, z], i) => cube(x, y, z, c[i]));
  else c.forEach((k, i) => cube(8 + (i % 2), i * 8, 4 + (i % 2), k));
  return hi(v);
}
function mTurtleHi() { // a soft toy turtle for calming down: the shell, a head peeking out, four feet
  const v = []; for (let x = 0; x <= 20; x++) for (let y = 2; y <= 9; y++) for (let z = 0; z <= 16; z++) { const dx = (x - 10) / 10, dy = (y - 2) / 7, dz = (z - 8) / 8; if (dx * dx + dy * dy + dz * dz <= 1) v.push([x, y, z, (x + z) % 6 < 2 && y > 6 ? 'leaf2' : 'leaf']); }
  fbox(v, 7, 2, 17, 6, 5, 5, 'leaf2'); v.push([8, 5, 22, 'ink'], [11, 5, 22, 'ink']);
  for (const [x, z] of [[2, 2], [15, 2], [2, 12], [15, 12]]) fbox(v, x, 0, z, 4, 2, 4, 'leaf2');
  return hi(v);
}
function mFeelRug() { const v = []; for (let x = 0; x < 28; x++) for (let z = 0; z < 22; z++) v.push([x, 0, z, (x < 2 || x > 25 || z < 2 || z > 19) ? 'pink' : 'cream']); return v; } // the rug of the feelings corner

const MODELS = { faceCardHi: mFaceCardHi, blocksHi: mBlocksHi, turtleHi: mTurtleHi, feelrug: mFeelRug,  dogHi: mDogHi, leashOnHi: mLeashOnHi, leashHi: mLeashHi, petBowlHi: mPetBowlHi, dogFoodHi: mDogFoodHi, bagRollHi: mBagRollHi, couch: mCouch, garmentHi: mGarmentHi, sockHi: mSockHi, washerHi: mWasherHi, laundryBasketHi: mLaundryBasketHi,  beetHi: mBeetHi, cabbageHi: mCabbageHi, tomatoHi: mTomatoHi, pumpkinHi: mPumpkinHi, carrotBunchHi: mCarrotBunchHi, partBinHi: mPartBinHi, scrubBrushHi: mScrubBrushHi, tubHi: mTubHi, post: mPost, farmstand: mFarmStand,  mixBowlHi: mMixBowlHi, flourBagHi: mFlourBagHi, flourInHi: mFlourInHi, eggInHi: mEggInHi, batterHi: mBatterHi, muffinPanHi: mMuffinPanHi, muffinsHi: mMuffinsHi, cookieHi: mCookieHi, breadRackHi: mBreadRackHi,  examtable: mExamTable, heightchart: mHeightChart, scaleHi: mScaleHi, stethHi: mStethHi, earLightHi: mEarLightHi, firstAidHi: mFirstAidHi, clothHi: mClothHi, bandageBoxHi: mBandageBoxHi, scrapeHi: mScrapeHi, bandageOnHi: mBandageOnHi,  schoolbus: mSchoolBus, busSignHi: mBusSignHi, safeSpotHi: mSafeSpotHi, railHi: mRailHi, hooksHi: mHooksHi, cubbyHi: mCubbyHi, trayHi: mTrayHi, kidDeskHi: mKidDeskHi, whiteboard: mWhiteboard,  tableBig: mTableBig, placeMatHi: mPlaceMatHi, forkHi: mForkHi, knifeHi: mKnifeHi, spoonHi: mSpoonHi, spotHi: mSpotHi, pantryHi: mPantryHi, groceryBagHi: mGroceryBagHi, eggBoxHi: mEggBoxHi, canHi: mCanHi, rackHi: mRackHi, raincoatHi: mRaincoatHi, sunHatHi: mSunHatHi, bootsHi: mBootsHi, sandalsHi: mSandalsHi, umbrellaHi: mUmbrellaHi, kidWearHi: mKidWearHi, rainHi: mRainHi, backpackHi: mBackpackHi, backpackZipHi: mBackpackZipHi, folderHi: mFolderHi, lunchBoxHi: mLunchBoxHi, bottleHi: mBottleHi, pencilCaseHi: mPencilCaseHi, toyCarHi: mToyCarHi, faceSudsHi: mFaceSudsHi, faceDropsHi: mFaceDropsHi, faceWashHi: mFaceWashHi, towelBarHi: mTowelBarHi, towelHeapHi: mTowelHeapHi, clothesHi: mClothesHi, hamperHi: mHamperHi, puddleHi: mPuddleHi, switchHi: mSwitchHi, switchOffHi: mSwitchOffHi, bikeHi: mBikeHi, shirtHi: mShirtHi, buttonHi: mButtonHi, spoolHi: mSpoolHi, needleHi: mNeedleHi, scissorsHi: mScissorsHi, threadHi: mThreadHi, wheelHi: mWheelHi, valveHi: mValveHi, capHi: mCapHi, pumpHi: mPumpHi, paperHi: mPaperHi, writingHi: mWritingHi, pencilHi: mPencilHi, envelopeHi: mEnvelopeHi, addressHi: mAddressHi, stampOnHi: mStampOnHi, stampsHi: mStampsHi, shareCardHi: mShareCardHi, binOkHi: mBinOkHi, robinHi: mRobinHi, squirrelHi: mSquirrelHi, beeHi: mBeeHi, ladybugHi: mLadybugHi, frogHi: mFrogHi, cardHi: mCardHi, binHi: mBinHi, keyHi: mKeyHi, phoneBigHi: mPhoneBigHi, alarmHi: mAlarmHi, smokeHi: mSmokeHi, doorHi: mDoorHi, treeHi: mTreeHi, claimHi: mClaimHi, bigBookHi: mBigBookHi, cerealHi: mCerealHi, tvAdHi: mTvAdHi, storyBookHi: mStoryBookHi, atlasHi: mAtlasHi, bin2Hi: mBin2Hi, gogglesHi: mGogglesHi, hammerHi: mHammerHi, screwdriverHi: mScrewdriverHi, wrenchHi: mWrenchHi, tapeHi: mTapeHi, chairHi: mChairHi, nailUpHi: mNailUpHi, nailDownHi: mNailDownHi, markHi: mMarkHi, breadMkt: mBreadMkt, applesHi: mApplesHi, shopBasketHi: mShopBasketHi, registerHi: mRegisterHi, billHi: mBillHi, bookHi: mBookHi, ballHi: mBallHi, toyBoxHi: mToyBoxHi, streamHi2: mStreamHi2, handsHi: mHandsHi, bubblesHi: mBubblesHi, soapHi: mSoapHi, towelHi: mTowelHi, cheeseHi: mCheeseHi, breadHi: mBreadHi, milkHi: mMilkHi, eggHi: mEggHi, honeyHi: mHoneyHi, pastaHi: mPastaHi, appleHi: mAppleHi, carrotHi: mCarrotHi, basketHi: mBasketHi, plateHi: mPlateHi, platesHi: mPlatesHi, breadBagHi: mBreadBagHi, sliceHi: mSliceHi, butterHi: mButterHi, layerHi: mLayerHi, lettuceHi: mLettuceHi, cheeseSlicesHi: mCheeseSlicesHi, sunHi: mSunHi, faceHi: mFaceHi, foamHi: mFoamHi, faucetHi: mFaucetHi, streamHi: mStreamHi, pasteHi: mPasteHi, cupHi: mCupHi, brushStand: mBrushStand, brushHi: mBrushHi, blobHi: mBlobHi, trowelHi: mTrowelHi, seedsHi: mSeedsHi, canHi: mCanHi, holeHi: mHoleHi, beanHi: mBeanHi, moundHi: mMoundHi, dropsHi: mDropsHi, sproutHi: mSproutHi, beanPlantHi: mBeanPlantHi, flowersHi: mFlowersHi, podsHi: mPodsHi, weedHi: mWeedHi, shirt: mShirt, button: mButton, spool: mSpool, needle: mNeedle, scissors: mScissors, thread: mThread, bike: mBike, wheel: mWheel, valve: mValve, pump: mPump, fountain: mFountain, swing: mSwing, applesspilled: mApplesSpilled, heavybag: mHeavyBag, shopfront: mShopFront, mailslots: mMailslots, mailbox2: mMailbox2, paper: mPaper, writing: mWriting, pencil: mPencil, envelope: mEnvelope, address: mAddress, stamps: mStamps, stampon: mStampOn, table2: mTable2, sharecard: mShareCard, robin: mRobin, squirrel: mSquirrel, beesm: mBeeSm, flowerbed: mFlowerBed, ladybug: mLadybug, frogsm: mFrogSm, parksign: mParkSign, bookcase: mBookcase, bigbook: mBigBook, claim: mClaim, board: mBoard, cereal: mCereal, tvad: mTvAd, storybook: mStoryBook, atlas: mAtlas, bin2: mBin2, beanbag: mBeanbag, globe: mGlobe, libraryhouse: mLibraryHouse, truck: mTruck, bin: mBin, card: mCard, phonebig: mPhoneBig, key: mKey, practicewall: mPracticeWall, alarm: mAlarm, smoke: mSmoke, door: mDoor, mat2: mMat2, firehouse: mFireHouse, stand: mStand, crate: mCrate, apples: mApples, cooler: mCooler, candy: mCandy, toyshelf: mToyShelf, shopbasket: mShopBasket, register: mRegister, bill: mBill, counter2: mCounter2, person: mPersonHi, kid: mKidHi, workbench: mBench, pegboard: mPegboard, hammer: mHammer, screwdriver: mScrewdriver, wrench: mWrench, tape: mTape, goggles: mGoggles, screwout: mScrewOut, planknail: mPlankNail, nailup: mNailUp, naildown: mNailDown, board: mBoard, mark: mMark, wagon: mWagon, boltloose: mBoltLoose, raisedbed: mRaisedBed, trowel: mTrowel, seeds: mSeeds, can: mCan, hole: mHole, beanseed: mBean, mound: mMound, drops: mDrops, sprout: mSprout, beanplant: mBeanPlant, flowers: mFlowers, pods: mPods, weed: mWeed, sun: mSun, fence: mFence, plate: mPlate, plates: mPlates, breadbag: mBreadBag, slice: mSlice, butter: mButter, layer: mLayer, lettuce: mLettuce, cheeseslices: mCheeseSlices, cheese: mCheese, milk: mMilk, egg: mEgg, honey: mHoney, bread: mBread, pasta: mPasta, apple: mApple, carrot: mCarrot, basket: mBasket, mirror: mMirror, face: mFace, foam: mFoam, cup: mCup, brushUp: mBrushUp, brush: mBrush, blob: mBlob, paste: mPaste, tub: mTub, mat: mMat, counter: mCounter, faucet: mFaucet, stream: mStream, soap: mSoap, hands: mHands, bubbles: mBubbles, towel: mTowel, fridge: mFridge, stove: mStove, table: mTable, stool: mStool, house: mHouse, workshop: mWorkshop, tree: mTree, bush: mBush, garden: mGarden, pond: mPond, lamp: mLamp, mailbox: mMailbox, bench: mBench, bed: mBed, desk: mDesk, chair: mChair, toybox: mToyBox, rug: mRug, book: mBook, ball: mBall, bedMessy: mBedMessy, window: mWindow, plant: mPlant, shelf: mShelf };

function yourRoom() { // the room itself; the things in it are roomThings(), each one tappable
  const b = [];
  for (let x = 0; x < 14; x++) for (let z = 0; z < 10; z++) b.push([x, 0, z, z % 2 ? 'floor' : 'floor2']); // floorboards (14 by 10 since 17 Nov 2026)
  for (let x = 0; x < 14; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'base' : 'wall']);
  for (let z = 1; z < 10; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'base' : 'wall2']);
  return b;
}
// Things: { id, model, at: [x, y, z] in blocks, opts, made (the model once its task step is done) }
function roomThings() {
  return [
    { id: 'window', model: 'window', at: [5.5, 2.2, 1] },
    { id: 'bed', model: 'bedMessy', made: 'bed', at: [1, 1, 1.02] },
    { id: 'rug', model: 'rug', at: [4.5, 1, 3] },
    { id: 'desk', model: 'desk', at: [7.6, 1, 1.05] }, { id: 'chair', model: 'chair', at: [8.1, 1, 2.6] },
    { id: 'toybox', model: 'toyBoxHi', at: [1.1, 1, 6.6] },
    { id: 'plant', model: 'plant', at: [9.2, 1, 6.8] },
    { id: 'shelf', model: 'shelf', at: [1.2, 3.6, 1.0] },
    // the mess: three books and a ball on the floor
    { id: 'book1', model: 'bookHi', scale: 1.3, opts: { c: 'book1' }, at: [5.4, 1.125, 4.4] },
    { id: 'book2', model: 'bookHi', scale: 1.3, opts: { c: 'book2' }, at: [6.3, 1.125, 3.6] },
    { id: 'book3', model: 'bookHi', scale: 1.3, opts: { c: 'book3' }, at: [3.4, 1, 6.2] },
    { id: 'ball', model: 'ballHi', at: [7.6, 1, 5.6] },
    // dress for the weather: a second window (rain today), a clothes rack, and you
    { id: 'window2', model: 'window', at: [10.9, 3.6, 1] }, { id: 'rain', model: 'rainHi', at: [11.025, 3.725, 1.14], hidden: true },
    { id: 'rack', model: 'rackHi', at: [10.3, 1, 1.25] },
    { id: 'raincoat', model: 'raincoatHi', at: [10.55, 1.62, 1.2] }, { id: 'sunhat', model: 'sunHatHi', at: [12.1, 2.1, 1.25] },
    { id: 'boots', model: 'bootsHi', at: [10.6, 1, 1.95] }, { id: 'sandals', model: 'sandalsHi', at: [12.3, 1, 1.95] }, { id: 'umbrella', model: 'umbrellaHi', at: [13.4, 1, 1.6] },
    { id: 'me', model: 'kid', opts: { shirt: 'pink', pants: 'ink2b', hair: 'darkwood' }, at: [9.9, 1, 4.3] },
    { id: 'coaton', model: 'kidWearHi', opts: { coat: true }, at: [9.9, 1, 4.3], hidden: true }, { id: 'bootson', model: 'kidWearHi', opts: { boots: true }, at: [9.9, 1, 4.3], hidden: true },
    { id: 'umbrellaon', model: 'umbrellaHi', opts: { open: true }, at: [9.9, 1, 4.3], hidden: true },
    // pack the backpack for tomorrow: the backpack by the door, what you need around the room, and a toy car
    { id: 'backpack', model: 'backpackHi', made: 'backpackZipHi', at: [11.2, 1, 7.6] },
    { id: 'folder', model: 'folderHi', at: [12.0, 1, 5.0] }, { id: 'pencils', model: 'pencilCaseHi', at: [8.6, 2.5, 2.2] },
    { id: 'lunch', model: 'lunchBoxHi', at: [12.6, 1, 6.6] }, { id: 'bottle', model: 'bottleHi', at: [9.9, 1, 6.3] }, { id: 'toycar', model: 'toyCarHi', at: [8.3, 1, 7.3] },
  ];
}
function kitchen() { // the neighbor's kitchen: checked tiles, two walls
  const b = [];
  for (let x = 0; x < 14; x++) for (let z = 0; z < 10; z++) b.push([x, 0, z, (x + z) % 2 ? 'tile' : 'tile2']);
  for (let x = 0; x < 14; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'base' : y === 3 ? 'stripe' : 'kwall']);
  for (let z = 1; z < 10; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'base' : y === 3 ? 'stripe' : 'kwall2']);
  return b;
}
function kitchenThings() {
  return [
    { id: 'counter', model: 'counter', opts: { w: 5, sink: 18 }, at: [2.5, 1, 1] },
    { id: 'faucet', model: 'faucetHi', at: [5.5, 2.25, 1.05] },
    { id: 'stream', model: 'streamHi2', opts: { h: 23 }, at: [5.59, 1.875, 1.47], hidden: true },
    { id: 'hands', model: 'handsHi', scale: 0.75, at: [4.85, 2.5, 1.75] },
    { id: 'bubbles', model: 'bubblesHi', scale: 0.75, at: [4.85, 2.5, 1.75], hidden: true },
    { id: 'soap', model: 'soapHi', at: [4.05, 2.25, 1.25] },
    { id: 'towel', model: 'towelHi', at: [6.6, 1.0, 2.15] },
    { id: 'window', model: 'window', at: [4.5, 2.8, 1] },
    { id: 'plant', model: 'plant', at: [6.0, 2.8, 1.05] },
    { id: 'island', model: 'counter', opts: { w: 3, d: 2 }, at: [1.2, 1, 3.0] },
    { id: 'plates', model: 'platesHi', at: [1.35, 2.25, 3.1] }, { id: 'breadbag', model: 'breadBagHi', at: [2.75, 2.25, 3.15] }, { id: 'butter', model: 'butterHi', at: [2.95, 2.25, 4.15] },
    { id: 'lettuce', model: 'lettuceHi', at: [6.35, 2.25, 1.55] }, { id: 'cheeseslices', model: 'cheeseSlicesHi', at: [7.0, 2.25, 1.6] },
    { id: 'plate', model: 'plateHi', at: [1.35, 2.25, 4.2], hidden: true },
    { id: 'slice1', model: 'sliceHi', at: [1.5, 2.32, 4.3], hidden: true },
    { id: 'butterlayer', model: 'layerHi', opts: { c: 'butter' }, at: [1.5, 2.385, 4.3], hidden: true },
    { id: 'leaf', model: 'layerHi', opts: { c: 'leaf3', wavy: true }, at: [1.5, 2.42, 4.3], hidden: true },
    { id: 'cheeseon', model: 'layerHi', opts: { c: 'cheese' }, at: [1.5, 2.48, 4.3], hidden: true },
    { id: 'slice2', model: 'sliceHi', at: [1.5, 2.52, 4.3], hidden: true },
    { id: 'fridge', model: 'fridge', at: [0.9, 1, 1.05] },
    { id: 'stove', model: 'stove', at: [7.8, 1, 1.05] },
    { id: 'table', model: 'table', opts: { bowl: false }, at: [4.2, 1, 4.8] },
    { id: 'plants', model: 'basketHi', opts: { kind: 'plant' }, at: [2.4, 1, 6.2] },
    { id: 'animals', model: 'basketHi', opts: { kind: 'animal' }, at: [6.6, 1, 6.2] },
    { id: 'cheese', model: 'cheeseHi', at: [4.4, 2.375, 4.95] }, { id: 'bread', model: 'breadHi', at: [5.0, 2.375, 4.95] },
    { id: 'milk', model: 'milkHi', at: [5.85, 2.375, 4.95] }, { id: 'apple', model: 'appleHi', at: [6.3, 2.375, 5.0] },
    { id: 'pasta', model: 'pastaHi', at: [4.45, 2.375, 5.85] }, { id: 'egg', model: 'eggHi', at: [5.0, 2.375, 5.95] },
    { id: 'carrot', model: 'carrotHi', at: [5.45, 2.375, 5.9] }, { id: 'honey', model: 'honeyHi', at: [6.25, 2.375, 5.9] },
    { id: 'stool1', model: 'stool', at: [3.4, 1, 5.4] }, { id: 'stool2', model: 'stool', at: [7.0, 1, 5.4] },
    // set the table: the dining table on the right, a mat with the shape of each thing, the things at the back of the table
    { id: 'dtable', model: 'tableBig', at: [9.9, 1, 3.9] }, { id: 'dstool', model: 'stool', at: [11.2, 1, 7.2] },
    { id: 'mat3', model: 'placeMatHi', at: [10.4, 2.375, 5.2] },
    { id: 'spotfork', model: 'spotHi', opts: { of: 'fork' }, at: [10.55, 2.41, 5.85] }, { id: 'spotplate', model: 'spotHi', opts: { of: 'plate' }, at: [10.95, 2.41, 5.75] },
    { id: 'spotknife', model: 'spotHi', opts: { of: 'knife' }, at: [12.3, 2.41, 5.85] }, { id: 'spotspoon', model: 'spotHi', opts: { of: 'spoon' }, at: [12.58, 2.41, 5.85] },
    { id: 'spotcup', model: 'spotHi', opts: { of: 'cup' }, at: [12.25, 2.41, 5.3] },
    { id: 'tplate', model: 'plateHi', at: [10.1, 2.375, 4.0] }, { id: 'tfork', model: 'forkHi', at: [11.45, 2.375, 4.1] }, { id: 'tknife', model: 'knifeHi', at: [11.8, 2.375, 4.1] },
    { id: 'tspoon', model: 'spoonHi', at: [12.1, 2.375, 4.1] }, { id: 'tcup', model: 'cupHi', at: [12.6, 2.375, 4.3] },
    // put the shopping away: an open cupboard by the stove, the bag and the food on the floor at the front
    { id: 'pantry', model: 'pantryHi', at: [9.6, 1, 1.05] },
    { id: 'gbag', model: 'groceryBagHi', at: [4.5, 1, 8.2] },
    { id: 'gmilk', model: 'milkHi', at: [3.4, 1, 8.6] }, { id: 'geggs', model: 'eggBoxHi', at: [5.5, 1, 8.9] }, { id: 'gcheese', model: 'cheeseHi', at: [6.4, 1, 8.3] },
    { id: 'gpasta', model: 'pastaHi', at: [2.3, 1, 8.7] }, { id: 'gcereal', model: 'cerealHi', at: [7.2, 1, 8.8] }, { id: 'gbeans', model: 'canHi', scale: 1.3, at: [3.9, 1, 9.3] },
  ];
}

function bathroom() { // your bathroom, bigger (17 Nov 2026): small tiles, two walls tall enough for the big mirror
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 10; z++) b.push([x, 0, z, (x + z) % 2 ? 'tile' : 'tile3']);
  for (let x = 0; x < 12; x++) for (let y = 1; y <= 6; y++) b.push([x, y, 0, y <= 2 ? 'btile' : 'bwall']);
  for (let z = 1; z < 10; z++) for (let y = 1; y <= 6; y++) b.push([0, y, z, y <= 2 ? 'btile' : 'bwall2']);
  return b;
}
function bathroomThings() { // the vanity is 4.8 blocks wide with its top at y 3; the basin runs x 5 to 7.8, z 1.4 to 2.8
  return [
    { id: 'vanity', model: 'counter', opts: { w: 3, sink: 5 }, scale: 1.6, at: [4, 1, 1] },
    { id: 'faucet', model: 'faucetHi', at: [6.25, 3, 1.2] },
    { id: 'stream', model: 'streamHi', at: [6.34, 2.42, 1.75], hidden: true },
    { id: 'mirror', model: 'mirror', scale: 1.6, at: [4.4, 3.3, 1.0] },
    { id: 'smile', model: 'faceHi', at: [5.4, 3.75, 1.42] },
    { id: 'foam', model: 'foamHi', at: [5.86, 4.06, 1.5], hidden: true },
    { id: 'cup', model: 'cupHi', at: [7.95, 3, 1.35] },
    { id: 'brushcup', model: 'brushStand', at: [8.1, 3.03, 1.45] },
    { id: 'brushcup2', model: 'brushStand', opts: { c: 'pink' }, at: [8.26, 3.03, 1.58] },
    { id: 'brush', model: 'brushHi', scale: 1.2, at: [5.1, 3.5, 2.75], hidden: true },
    { id: 'blob', model: 'blobHi', scale: 1.4, at: [6.55, 3.72, 2.78], hidden: true },
    { id: 'paste', model: 'pasteHi', scale: 1.4, at: [4.12, 3, 2.15] },
    { id: 'tub', model: 'tub', scale: 1.6, at: [1.0, 1, 3.0] },
    { id: 'mat', model: 'mat', scale: 1.6, at: [5.0, 1, 4.6] },
    { id: 'towel', model: 'towel', scale: 1.6, at: [9.6, 2.4, 1.02] },
    // wash your face: a gentle face wash, soap and water on your face in the mirror
    { id: 'facewash', model: 'faceWashHi', scale: 1.4, at: [4.35, 3, 1.3] },
    { id: 'facesuds', model: 'faceSudsHi', at: [5.4, 3.75, 1.42], hidden: true }, { id: 'facedrops', model: 'faceDropsHi', at: [5.4, 3.75, 1.42], hidden: true },
    // tidy the bathroom: a wet towel on the floor, dirty clothes, a puddle, and the light switch
    { id: 'bar', model: 'towelBarHi', at: [1.6, 1.6, 1.02] }, { id: 'towelhung', model: 'towelHi', at: [1.6, 1.6, 1.02], hidden: true },
    { id: 'floortowel', model: 'towelHeapHi', at: [8.4, 1, 6.9] }, { id: 'clothes', model: 'clothesHi', at: [7.4, 1, 7.9] },
    { id: 'hamper', model: 'hamperHi', at: [9.8, 1, 6.4] }, { id: 'puddle', model: 'puddleHi', at: [4.9, 1, 7.3] },
    { id: 'switch', model: 'switchHi', made: 'switchOffHi', at: [11.4, 2.7, 1.02] },
  ];
}

function yard() { // your back garden, bigger (17 Nov 2026): grass, a path
  const b = [];
  for (let x = 0; x < 14; x++) for (let z = 0; z < 11; z++) b.push([x, 0, z, x === 3 && z > 7 ? 'walk' : 'grass']);
  return b;
}
function yardThings() { // the raised bed is 4.8 by 3.2 blocks with its soil at y 2.2; the bean grows near its front edge, where you can see it
  const at = [7.4, 2.2, 6.0];
  return [
    { id: 'fence1', model: 'fence', opts: { len: 14 }, at: [0, 1, 0.2] }, { id: 'fence2', model: 'fence', opts: { len: 11, alongZ: true }, at: [0.2, 1, 0] },
    { id: 'tree', model: 'tree', opts: { r: 11, trunk: 16 }, scale: 1.3, at: [2.0, 1, 2.0] },
    { id: 'bed', model: 'raisedbed', scale: 1.6, at: [5, 1, 3.5] },
    { id: 'sun', model: 'sunHi', at: [10.0, 4.0, 4.8] },
    { id: 'trowel', model: 'trowelHi', at: [5.5, 1, 7.2] }, { id: 'seeds', model: 'seedsHi', at: [6.9, 1, 7.6] }, { id: 'can', model: 'canHi', at: [8.2, 1, 7.4] },
    { id: 'bench', model: 'bench', at: [10.6, 1, 8.8] },
    { id: 'hole', model: 'holeHi', scale: 1.3, at: [at[0], at[1], at[2]], hidden: true },
    { id: 'beanseed', model: 'beanHi', scale: 1.8, at: [at[0], at[1] - 0.04, at[2]], hidden: true },
    { id: 'mound', model: 'moundHi', scale: 1.3, at: [at[0], at[1], at[2]], hidden: true },
    { id: 'drops', model: 'dropsHi', at: [at[0], at[1] + 0.2, at[2]], hidden: true },
    { id: 'sprout', model: 'sproutHi', at: [at[0], at[1] + 0.1, at[2]], hidden: true },
    { id: 'plant', model: 'beanPlantHi', at: [at[0], at[1] + 0.1, at[2]], hidden: true },
    { id: 'flowers', model: 'flowersHi', at: [at[0], at[1] + 0.1, at[2]], hidden: true },
    { id: 'pods', model: 'podsHi', at: [at[0], at[1] + 0.1, at[2]], hidden: true },
    { id: 'weed', model: 'weedHi', scale: 1.3, at: [8.7, 2.2, 5.9], hidden: true },
  ];
}

function shop() { // inside the workshop: plank floor, plank walls
  const b = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, x % 2 ? 'planks' : 'planks2']);
  for (let x = 0; x < 10; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, x % 2 ? 'swall' : 'swall2']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, z % 2 ? 'swall' : 'swall2']);
  return b;
}
function shopThings() {
  return [
    { id: 'workbench', model: 'workbench', at: [2, 1, 1] },
    { id: 'pegboard', model: 'pegboard', at: [2.2, 2.7, 1.0] },
    { id: 'goggles', model: 'gogglesHi', scale: 1.4, at: [6.0, 2.25, 1.75] },
    { id: 'hammer', model: 'hammerHi', scale: 1.4, at: [2.5, 2.25, 1.25] }, { id: 'screwdriver', model: 'screwdriverHi', scale: 1.4, at: [3.4, 2.25, 1.25] },
    { id: 'wrench', model: 'wrenchHi', scale: 1.4, at: [4.2, 2.25, 1.3] }, { id: 'tape', model: 'tapeHi', scale: 1.4, at: [4.95, 2.25, 1.3] },
    // the jobs: a wobbly chair, a nail sticking up, a board to measure, a wagon with a loose bolt
    { id: 'chair', model: 'chairHi', at: [1.6, 1, 4.2] }, { id: 'screwout', model: 'screwout', at: [2.6, 1.7, 4.3] },
    { id: 'plank', model: 'planknail', at: [3.6, 1, 4.6] }, { id: 'nailup', model: 'nailUpHi', scale: 1.4, at: [4.6, 1.125, 4.8] }, { id: 'naildown', model: 'nailDownHi', scale: 1.4, at: [4.6, 1.125, 4.8], hidden: true },
    { id: 'board', model: 'board', at: [5.9, 1, 4.5] }, { id: 'mark', model: 'markHi', scale: 1.3, at: [6.9, 1.125, 4.5], hidden: true },
    { id: 'wagon', model: 'wagon', at: [7.6, 1, 3.4] }, { id: 'boltloose', model: 'boltloose', at: [9.1, 1.5, 3.8] },
  ];
}

function market() { // the market: warm tiles, two walls
  const b = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, (x + z) % 2 ? 'mtile' : 'mtile2']);
  for (let x = 0; x < 10; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 4 ? 'stripe' : 'mwall']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 4 ? 'stripe' : 'mwall2']);
  return b;
}
function marketThings() {
  return [
    { id: 'stand1', model: 'stand', opts: { w: 2 }, at: [1.2, 1, 1.1] }, { id: 'crate', model: 'crate', at: [1.4, 2.125, 1.2] },
    { id: 'apples', model: 'applesHi', scale: 1.4, at: [2.2, 2.125, 1.75] },
    { id: 'stand2', model: 'stand', opts: { w: 2, top: 'crust' }, at: [3.6, 1, 1.1] }, { id: 'bread', model: 'breadMkt', at: [4.1, 2.125, 1.4] },
    { id: 'cooler', model: 'cooler', at: [6.0, 1, 1.05] }, { id: 'milk', model: 'milkHi', at: [6.4, 1, 2.3] },
    { id: 'toyshelf', model: 'toyshelf', at: [1.05, 1, 3.4] },
    { id: 'candy', model: 'candy', at: [8.3, 1, 2.6] },
    { id: 'counter2', model: 'counter2', at: [6.0, 1, 4.6] }, { id: 'register', model: 'registerHi', at: [7.5, 2.25, 4.75] },
    { id: 'cashier', model: 'person', opts: { shirt: 'pink', apron: 'white' }, at: [7.3, 1, 4.1] },
    { id: 'bill', model: 'billHi', scale: 1.2, at: [6.3, 2.25, 5.0] },
    { id: 'basket', model: 'shopBasketHi', at: [2.6, 1, 5.0] },
  ];
}

function station() { // inside the fire station: a clean grey floor, two walls
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (x + z) % 2 ? 'ftile' : 'ftile2']);
  for (let x = 0; x < 12; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 2 ? 'firered' : 'fwall']);
  for (let z = 1; z < 9; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 2 ? 'firered' : 'fwall2']);
  return b;
}
function stationThings() {
  const K = (c, r) => [5.4 + (4 + c * 12) / 32, 1 + (40 - r * 12) / 32, 6.4 + 8 / 32];
  return [
    { id: 'truck', model: 'truck', at: [5.5, 1, 1.2] },
    { id: 'firefighter', model: 'person', opts: { shirt: 'firered', apron: 'sun', helmet: 'sun' }, at: [3.8, 1, 2.2] },
    { id: 'table', model: 'stand', opts: { w: 3, top: 'wood' }, at: [1.1, 1, 3.4] },
    { id: 'cardfire', model: 'cardHi', opts: { pic: 'fire' }, at: [1.3, 2.25, 3.8] }, { id: 'cardhurt', model: 'cardHi', opts: { pic: 'hurt' }, at: [2.1, 2.25, 3.8] },
    { id: 'cardtoy', model: 'cardHi', opts: { pic: 'toy' }, at: [2.9, 2.25, 3.8] }, { id: 'cardpuzzle', model: 'cardHi', opts: { pic: 'puzzle' }, at: [3.7, 2.25, 3.8] },
    { id: 'callbin', model: 'binHi', opts: { kind: 'call' }, at: [0.9, 1, 6.2] }, { id: 'grownbin', model: 'binHi', opts: { kind: 'home' }, at: [2.8, 1, 6.2] },
    { id: 'phone', model: 'phoneBigHi', at: [5.4, 1, 6.4] },
    { id: 'k9', model: 'keyHi', opts: { n: 9 }, at: K(2, 2) }, { id: 'k1', model: 'keyHi', opts: { n: 1 }, at: K(0, 0) },
    { id: 'practice', model: 'practicewall', at: [8.0, 1, 5.0] }, { id: 'alarm', model: 'alarmHi', scale: 1.4, at: [8.5, 3.62, 5.15] },
    { id: 'smoke', model: 'smokeHi', at: [8.1, 2.6, 5.25], hidden: true },
    { id: 'door', model: 'doorHi', at: [9.0, 1, 5.1] },
    { id: 'crawl', model: 'mat2', at: [8.2, 1, 6.2] },
    { id: 'meet', model: 'treeHi', at: [11.0, 1, 7.6] },
  ];
}

function library() { // the library: warm wood floor, two walls
  const b = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, x % 2 ? 'ltile' : 'ltile2']);
  for (let x = 0; x < 10; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 1 ? 'base' : 'lwall']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 1 ? 'base' : 'lwall2']);
  return b;
}
function libraryThings() {
  return [
    { id: 'case1', model: 'bookcase', opts: { w: 3 }, at: [1.1, 1, 1.05] }, { id: 'case2', model: 'bookcase', opts: { w: 3 }, at: [4.3, 1, 1.05] },
    { id: 'librarian', model: 'person', opts: { shirt: 'book2', apron: 'cream', hair: 'ink' }, at: [8.2, 1, 2.0] },
    { id: 'desk', model: 'stand', opts: { w: 3, top: 'wood' }, at: [7.4, 1, 2.6] },
    { id: 'bugbook', model: 'bigBookHi', opts: { pic: 'bug', c: 'leaf' }, at: [7.5, 2.125, 2.9] }, { id: 'spacebook', model: 'bigBookHi', opts: { pic: 'space', c: 'ink' }, at: [8.25, 2.125, 2.9] },
    { id: 'birdbook', model: 'bigBookHi', opts: { pic: 'bird', c: 'sky' }, at: [9.0, 2.125, 2.9] }, { id: 'animalbook', model: 'bigBookHi', opts: { pic: 'animal', c: 'orange' }, at: [9.75, 2.125, 2.9] },
    { id: 'rug2', model: 'rug', at: [3.5, 1, 4.2] }, { id: 'globe', model: 'globe', at: [7.6, 1, 4.6] },
    { id: 'beanbag', model: 'beanbag', opts: { c: 'pink' }, at: [1.0, 1, 4.2] },
    // check it: claim cards on the rug, two boards to pin them to
    { id: 'spider', model: 'claimHi', opts: { pic: 'spider' }, at: [3.6, 1.05, 4.4] }, { id: 'sunstar', model: 'claimHi', opts: { pic: 'sun' }, at: [4.6, 1.05, 4.4] },
    { id: 'penguin', model: 'claimHi', opts: { pic: 'penguin' }, at: [5.6, 1.05, 4.4] }, { id: 'bat', model: 'claimHi', opts: { pic: 'bat' }, at: [4.1, 1.05, 5.35] },
    { id: 'trueboard', model: 'board', opts: { kind: 'true' }, at: [1.4, 2.3, 3.1] }, { id: 'notboard', model: 'board', opts: { kind: 'not' }, at: [4.6, 2.3, 3.1] },
    // who made this, and why: four things, two bins
    { id: 'cereal', model: 'cerealHi', at: [6.9, 1, 5.8] }, { id: 'tvad', model: 'tvAdHi', at: [7.8, 1.2, 5.8] },
    { id: 'storybook', model: 'storyBookHi', at: [8.9, 1, 5.9] }, { id: 'atlas', model: 'atlasHi', at: [9.0, 1, 5.0] },
    { id: 'storybin', model: 'bin2Hi', opts: { kind: 'story' }, at: [6.6, 1, 6.7] }, { id: 'sellbin', model: 'bin2Hi', opts: { kind: 'sell' }, at: [8.4, 1, 6.7] },
  ];
}

function post() { // the post office: light blue tiles, two walls
  const b = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, (x + z) % 2 ? 'ptile' : 'ptile2']);
  for (let x = 0; x < 10; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 2 ? 'sky' : 'pwall']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 2 ? 'sky' : 'pwall2']);
  return b;
}
function postThings() {
  return [
    { id: 'slots', model: 'mailslots', at: [5.5, 2.2, 1.02] },
    { id: 'counter3', model: 'counter2', at: [5.4, 1, 2.4] }, { id: 'clerk', model: 'person', opts: { shirt: 'sky', apron: 'white', hair: 'darkwood' }, at: [7.0, 1, 1.8] },
    { id: 'mailbox', model: 'mailbox2', at: [8.6, 1.25, 6.0] },
    { id: 'writetable', model: 'table2', at: [1.4, 1, 3.0] },
    { id: 'paper', model: 'paperHi', at: [1.65, 2.125, 3.2] }, { id: 'pencil', model: 'pencilHi', at: [2.6, 2.125, 3.35] },
    { id: 'envelope', model: 'envelopeHi', at: [2.9, 2.125, 4.0] }, { id: 'stamps', model: 'stampsHi', at: [3.15, 2.125, 3.2] },
    { id: 'writing', model: 'writingHi', at: [1.65, 2.16, 3.2], hidden: true },
    { id: 'letter', model: 'envelopeHi', opts: { closed: true }, scale: 1.2, at: [1.7, 2.125, 3.4], hidden: true },
    { id: 'address', model: 'addressHi', scale: 1.2, at: [1.7, 2.24, 3.4], hidden: true }, { id: 'stampon', model: 'stampOnHi', scale: 1.2, at: [1.7, 2.24, 3.4], hidden: true },
    // is it OK to share? cards on the counter end, two bins
    { id: 'favcolor', model: 'shareCardHi', opts: { pic: 'color' }, at: [1.2, 1.05, 5.1] }, { id: 'petname', model: 'shareCardHi', opts: { pic: 'pet' }, at: [2.25, 1.05, 5.1] },
    { id: 'homeaddr', model: 'shareCardHi', opts: { pic: 'home' }, at: [3.3, 1.05, 5.1] }, { id: 'password', model: 'shareCardHi', opts: { pic: 'lock' }, at: [4.35, 1.05, 5.1] },
    { id: 'okbin', model: 'binOkHi', at: [1.3, 1, 6.3] }, { id: 'askbin', model: 'binHi', opts: { kind: 'home' }, at: [3.3, 1, 6.3] },
  ];
}
function park() { // the park: grass, a winding path
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (z === 7 || (x === 3 && z > 2)) ? 'path2' : 'grass']);
  return b;
}
function parkThings() {
  return [
    { id: 'tree1', model: 'tree', opts: { r: 12, trunk: 16 }, at: [1.8, 1, 1.8] }, { id: 'tree2', model: 'tree', opts: { r: 10, trunk: 14 }, at: [10.4, 1, 1.6] },
    { id: 'pond2', model: 'pond', at: [8.4, 1, 5.0] },
    { id: 'flowers', model: 'flowerbed', at: [4.2, 1, 3.0] },
    { id: 'bench2', model: 'bench', at: [5.2, 1, 7.6] }, { id: 'sign', model: 'parksign', at: [0.8, 1, 7.6] },
    { id: 'robin', model: 'robinHi', scale: 1.6, at: [2.0, 1, 5.4] }, { id: 'squirrel', model: 'squirrelHi', scale: 1.6, at: [10.4, 1, 2.8] },
    { id: 'bee', model: 'beeHi', scale: 1.8, at: [4.9, 2.0, 3.4] }, { id: 'ladybug', model: 'ladybugHi', scale: 1.8, at: [6.2, 1.3, 3.7] },
    { id: 'frog', model: 'frogHi', scale: 1.6, at: [7.3, 1.1, 4.5] },
  ];
}

function cafe() { // the repair cafe: warm tiles, two walls
  const b = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) b.push([x, 0, z, (x + z) % 2 ? 'ctile' : 'ctile2']);
  for (let x = 0; x < 10; x++) for (let y = 1; y <= 5; y++) b.push([x, y, 0, y === 3 ? 'sun' : 'cwall']);
  for (let z = 1; z < 8; z++) for (let y = 1; y <= 5; y++) b.push([0, y, z, y === 3 ? 'sun' : 'cwall2']);
  return b;
}
function cafeThings() {
  return [
    { id: 'helper', model: 'person', opts: { shirt: 'teal', apron: 'sun', hair: 'stone' }, at: [3.6, 1, 1.6] },
    { id: 'sewtable', model: 'table2', at: [1.2, 1, 2.6] },
    { id: 'shirt', model: 'shirtHi', at: [1.7, 2.125, 2.8] }, { id: 'button', model: 'buttonHi', scale: 1.5, at: [3.25, 2.125, 3.55] },
    { id: 'spool', model: 'spoolHi', scale: 1.4, at: [3.2, 2.125, 2.75] }, { id: 'needle', model: 'needleHi', scale: 1.3, at: [2.3, 2.125, 4.35] }, { id: 'scissors', model: 'scissorsHi', scale: 1.3, at: [3.25, 2.125, 4.05] },
    { id: 'buttonon', model: 'buttonHi', scale: 1.2, at: [2.26, 2.16, 3.36], hidden: true }, { id: 'thread', model: 'threadHi', scale: 1.2, at: [2.26, 2.16, 3.36], hidden: true },
    { id: 'bike', model: 'bikeHi', at: [5.6, 1, 3.0] }, { id: 'tireflat', model: 'wheelHi', opts: { flat: true }, at: [7.6, 1, 3.0] }, { id: 'tirefull', model: 'wheelHi', at: [7.6, 1, 3.0], hidden: true },
    { id: 'valve', model: 'valveHi', scale: 2.2, at: [8.0, 2.05, 3.12] }, { id: 'cap', model: 'capHi', scale: 2.2, at: [8.0, 2.05, 3.12] },
    { id: 'pump', model: 'pumpHi', at: [8.5, 1, 3.9] },
    { id: 'plant', model: 'plant', at: [8.8, 1, 1.4] },
  ];
}
function square() { // the town square: paving stones
  const b = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 9; z++) b.push([x, 0, z, (x + z * 3) % 4 ? 'plaza' : 'plaza2']);
  return b;
}
function squareThings() {
  return [
    { id: 'fountain', model: 'fountain', at: [6, 1, 4.5] },
    { id: 'treeA', model: 'tree', opts: { r: 9, trunk: 14 }, at: [1.4, 1, 1.4] }, { id: 'treeB', model: 'tree', opts: { r: 9, trunk: 14 }, at: [10.6, 1, 1.4] },
    { id: 'swing', model: 'swing', at: [8.5, 1, 6.6] },
    { id: 'benchA', model: 'bench', at: [1.6, 1, 4.6] },
    // neighbors who could use a kind word or a hand
    { id: 'spill', model: 'applesspilled', at: [3.2, 1, 2.3] }, { id: 'shopper', model: 'person', opts: { shirt: 'pink', hair: 'darkwood', mood: 'oops' }, at: [2.6, 1, 2.0] },
    { id: 'newkid', model: 'kid', opts: { shirt: 'teal', hair: 'ink', mood: 'shy', skin: 'skin2' }, at: [9.2, 1, 3.6] },
    { id: 'sadkid', model: 'kid', opts: { shirt: 'sky2', pants: 'ink2b', mood: 'sad' }, at: [2.4, 1.6, 5.1] },
    { id: 'swingkids', model: 'kid', opts: { shirt: 'orange', hair: 'crust' }, at: [7.5, 1, 7.6] },
    { id: 'elder', model: 'person', opts: { shirt: 'stone2', hair: 'white' }, at: [4.6, 1, 7.4] }, { id: 'bag', model: 'heavybag', at: [5.1, 1, 7.6] },
  ];
}

function noThings() { return []; }

const PLACES = {
  street: { name: 'The street', build: street, things: streetThings, hub: true, doors: STREET_DOORS, smooth: true, view: { angle: 20, tilt: 44, dist: 46 }, town: TOWN },
  kitchen: { name: 'The kitchen', build: kitchen, things: kitchenThings, task: 'wash-hands', tasks: ['wash-hands', 'food-from', 'sandwich', 'set-table', 'groceries'], smooth: true, view: { angle: 28, tilt: 34, dist: 31 } },
  bathroom: { name: 'Your bathroom', build: bathroom, things: bathroomThings, task: 'brush-teeth', tasks: ['brush-teeth', 'wash-face', 'tidy-bath'], smooth: true, view: { angle: 28, tilt: 28, dist: 22 } },
  yard: { name: 'Your garden', build: yard, things: yardThings, task: 'grow-bean', smooth: true, view: { angle: 26, tilt: 30, dist: 25 } },
  shop: { name: 'The workshop', build: shop, things: shopThings, task: 'fix-it', smooth: true, view: { angle: 26, tilt: 34, dist: 25 } },
  market: { name: 'The market', build: market, things: marketThings, task: 'shop-list', smooth: true, view: { angle: 26, tilt: 34, dist: 25 } },
  station: { name: 'The fire station', build: station, things: stationThings, tasks: ['call-help', 'fire-escape'], smooth: true, view: { angle: 26, tilt: 34, dist: 29 } },
  library: { name: 'The library', build: library, things: libraryThings, tasks: ['check-it', 'who-made'], smooth: true, view: { angle: 26, tilt: 34, dist: 26 } },
  post: { name: 'The post office', build: post, things: postThings, tasks: ['letter', 'share-safe'], smooth: true, view: { angle: 26, tilt: 34, dist: 25 } },
  park: { name: 'The park', build: park, things: parkThings, task: 'who-lives', smooth: true, view: { angle: 24, tilt: 36, dist: 28 } },
  cafe: { name: 'The repair cafe', build: cafe, things: cafeThings, tasks: ['sew-button', 'pump-tire'], smooth: true, view: { angle: 26, tilt: 34, dist: 24 } },
  square: { name: 'The town square', build: square, things: squareThings, task: 'good-neighbor', smooth: true, view: { angle: 24, tilt: 36, dist: 28 } },
  busstop: { name: 'The bus stop', build: busstop, things: busstopThings, task: 'bus-stop', smooth: true, view: { angle: 16, tilt: 32, dist: 17 } },
  school: { name: 'The school', build: school, things: schoolThings, tasks: ['ready-class', 'big-feeling'], smooth: true, view: { angle: 26, tilt: 34, dist: 22 } },
  clinic: { name: 'The clinic', build: clinic, things: clinicThings, tasks: ['small-cut', 'checkup'], smooth: true, view: { angle: 22, tilt: 32, dist: 21 } },
  bakery: { name: 'The bakery', build: bakery, things: bakeryThings, tasks: ['bake-muffins', 'share-fair'], smooth: true, view: { angle: 22, tilt: 32, dist: 21 } },
  farmstand: { name: 'The farm stand', build: farmstand, things: farmstandThings, tasks: ['plant-parts', 'wash-produce'], smooth: true, view: { angle: 20, tilt: 34, dist: 21 } },
  pethouse: { name: 'The dog next door', build: pethouse, things: pethouseThings, task: 'pet-care', smooth: true, view: { angle: 22, tilt: 32, dist: 19 } },
  laundry: { name: 'The laundry room', build: laundry, things: laundryThings, tasks: ['sort-laundry', 'match-socks'], smooth: true, view: { angle: 22, tilt: 34, dist: 19 } },
  machine: { name: 'Try Try Again', machine: true, build: noThings, things: noThings, view: { angle: 0, tilt: 10, dist: 30 } },
  room: { name: 'Your room', build: yourRoom, things: roomThings, task: 'tidy-room', tasks: ['tidy-room', 'dress-weather', 'pack-bag'], smooth: true, view: { angle: 30, tilt: 34, dist: 31 } },
};

module.exports = { COLORS, TOWN, PLACES, MODELS, HELPERS: [box, set, hi, ell, trio, mFaceCardHi, mBlocksHi, mTurtleHi, mFeelRug, mDogHi, mLeashOnHi, mLeashHi, mPetBowlHi, mDogFoodHi, mBagRollHi, mCouch, mGarmentHi, mSockHi, mWasherHi, mLaundryBasketHi, pethouse, pethouseThings, laundry, laundryThings, mBeetHi, mCabbageHi, mTomatoHi, mPumpkinHi, mCarrotBunchHi, mPartBinHi, mScrubBrushHi, mTubHi, mPost, mFarmStand, farmstand, farmstandThings, bowlShell, mFill, mMixBowlHi, mFlourBagHi, mFlourInHi, mEggInHi, mBatterHi, mMuffinPanHi, mMuffinsHi, mCookieHi, mBreadRackHi, bakery, bakeryThings, mExamTable, mHeightChart, mScaleHi, mStethHi, mEarLightHi, mFirstAidHi, mClothHi, mBandageBoxHi, mScrapeHi, mBandageOnHi, clinic, clinicThings, mSchoolBus, mBusSignHi, mSafeSpotHi, mRailHi, mHooksHi, mCubbyHi, mTrayHi, mKidDeskHi, mWhiteboard, busstop, busstopThings, school, schoolThings, mTableBig, mPlaceMatHi, mForkHi, mKnifeHi, mSpoonHi, mSpotHi, mPantryHi, mGroceryBagHi, mEggBoxHi, mCanHi, mRackHi, mRaincoatHi, mSunHatHi, mBootsHi, mSandalsHi, mUmbrellaHi, mKidWearHi, mRainHi, mBackpackHi, mBackpackZipHi, mFolderHi, mLunchBoxHi, mBottleHi, mPencilCaseHi, mToyCarHi, mFaceSudsHi, mFaceDropsHi, mFaceWashHi, mTowelBarHi, mTowelHeapHi, mClothesHi, mHamperHi, mPuddleHi, mSwitchHi, mSwitchOffHi, mPersonHi, mKidHi, mBikeHi, mShirtHi, mButtonHi, mSpoolHi, mNeedleHi, mScissorsHi, mThreadHi, mWheelHi, mValveHi, mCapHi, mPumpHi, mPaperHi, mWritingHi, mPencilHi, mEnvelopeHi, mAddressHi, mStampOnHi, mStampsHi, mShareCardHi, mBinOkHi, mRobinHi, mSquirrelHi, mBeeHi, mLadybugHi, mFrogHi, iconData, picXY, picXZ, mCardHi, mBinHi, mKeyHi, mPhoneBigHi, mAlarmHi, mSmokeHi, mDoorHi, mTreeHi, mClaimHi, mBigBookHi, mCerealHi, mTvAdHi, mStoryBookHi, mAtlasHi, mBin2Hi, digit, mGogglesHi, mHammerHi, mScrewdriverHi, mWrenchHi, mTapeHi, mChairHi, mNailUpHi, mNailDownHi, mMarkHi, mBreadMkt, mApplesHi, mShopBasketHi, mRegisterHi, mBillHi, hand, mBookHi, mBallHi, mToyBoxHi, mStreamHi2, mHandsHi, mBubblesHi, mSoapHi, mTowelHi, mCheeseHi, mBreadHi, mMilkHi, mEggHi, mHoneyHi, mPastaHi, mAppleHi, mCarrotHi, mBasketHi, mPlateHi, mPlatesHi, mBreadBagHi, mSliceHi, mButterHi, mLayerHi, mLettuceHi, mCheeseSlicesHi, mSunHi, mFaceHi, mFoamHi, mFaucetHi, mStreamHi, mPasteHi, mCupHi, mBrushStand, mBrushHi, mBlobHi, mTrowelHi, mSeedsHi, mCanHi, mHoleHi, mBeanHi, mMoundHi, mDropsHi, mSproutHi, mBeanPlantHi, mFlowersHi, mPodsHi, mWeedHi, hollowHouse, fbox, place, mHouse, mWorkshop, mTree, mBush, mGarden, mPond, mLamp, mMailbox, mBench, street, mBed, mBedMessy, mDesk, mChair, mToyBox, mBall, mRug, mBook, mWindow, mPlant, mShelf, yourRoom, roomThings, noThings, mCounter, mFaucet, mStream, mSoap, mHands, mBubbles, mTowel, mFridge, mStove, mTable, mStool, kitchen, kitchenThings, mMirror, mFace, mFoam, mCup, mBrushUp, mBrush, mBlob, mPaste, mTub, mMat, bathroom, bathroomThings, mCheese, mMilk, mEgg, mHoney, mBread, mPasta, mApple, mCarrot, mBasket, mPlate, mPlates, mBreadBag, mSlice, mButter, mLayer, mLettuce, mCheeseSlices, mRaisedBed, mTrowel, mSeeds, mCan, mHole, mBean, mMound, mDrops, mSprout, mBeanPlant, mFlowers, mPods, mWeed, mSun, mFence, yard, yardThings, mBench, mPegboard, mHammer, mScrewdriver, mWrench, mTape, mGoggles, mScrewOut, mPlankNail, mNailUp, mNailDown, mBoard, mMark, mWagon, mBoltLoose, shop, shopThings, mKid, streetThings, mStand, mCrate, mApples, mCooler, mCandy, mToyShelf, mShopBasket, mRegister, mBill, mCounter2, mPerson, market, marketThings, mTruck, mBin, mCard, mPhoneBig, mKey, mPracticeWall, mAlarm, mSmoke, mDoor, mMat2, mFireHouse, station, stationThings, mBookcase, mBigBook, mClaim, mBoard, mCereal, mTvAd, mStoryBook, mAtlas, mBin2, mBeanbag, mGlobe, mLibraryHouse, library, libraryThings, mShopFront, mMailslots, mMailbox2, mPaper, mWriting, mPencil, mEnvelope, mAddress, mStamps, mStampOn, mTable2, mShareCard, mRobin, mSquirrel, mBeeSm, mFlowerBed, mLadybug, mFrogSm, mParkSign, post, postThings, park, parkThings, mShirt, mButton, mSpool, mNeedle, mScissors, mThread, mBike, mWheel, mValve, mPump, mFountain, mSwing, mApplesSpilled, mHeavyBag, cafe, cafeThings, square, squareThings], MODEL_NAMES: Object.fromEntries(Object.entries(MODELS).map(([k, f]) => [k, f.name])) }; // build.js puts these functions' text in the page
