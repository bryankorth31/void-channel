// VoidTV PLAY: tests for where the picture and the touch pad go. Licence: GPL-2.0-or-later (play/LICENSE).
// The three screens Bryan checks on: 1920x1080 (PC), 1316x821 (tablet sideways), 821x1316 (tablet upright).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Layout = require(path.join(__dirname, '..', 'src', 'layout.js'));

const SCREENS = [[1920, 1080, 'PC'], [1316, 821, 'tablet sideways'], [821, 1316, 'tablet upright'],
  [390, 844, 'phone upright'], [844, 390, 'phone sideways']];
const inside = (r, vw, vh) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh;

for (const [vw, vh, name] of SCREENS) {
  for (const touch of [false, true]) {
    test(`${vw}x${vh} (${name}), touch ${touch ? 'on' : 'off'}: the picture fits, keeps 4:3 and is never covered`, () => {
      const L = Layout.layout(vw, vh, 4 / 3, touch);
      assert.ok(inside(L.screen, vw, vh), 'picture on screen');
      assert.ok(L.screen.y >= Layout.HEADER, 'picture under the header');
      assert.ok(L.screen.w > 0 && L.screen.h > 0, 'picture has a size');
      assert.ok(Math.abs(L.screen.w / L.screen.h - 4 / 3) < 0.02, 'shape kept');
      for (const z of ['left', 'right', 'pad']) {
        if (!L[z]) continue;
        assert.ok(inside(L[z], vw, vh), z + ' on screen');
        assert.ok(!Layout.overlaps(L.screen, L[z]), z + ' does not cover the picture');
      }
      if (!touch) assert.equal(L.mode, 'plain');
      else assert.equal(L.mode, vw > vh ? 'landscape' : 'portrait');
    });
  }
}

// The tablet is the device the touch pad is sized for (plan T7): every zone holds thumb-sized keys.
for (const [vw, vh] of [[1316, 821], [821, 1316]]) {
  test(`${vw}x${vh}: each touch zone has room for keys of at least ${Layout.MIN_KEY} px`, () => {
    const L = Layout.layout(vw, vh, 4 / 3, true);
    for (const z of ['left', 'right', 'pad']) {
      if (!L[z]) continue;
      assert.ok(L[z].w >= Layout.MIN_KEY * 3, z + ' wide enough for three keys');
      assert.ok(L[z].h >= Layout.MIN_KEY * 3, z + ' tall enough for three keys');
    }
  });
}

test('the picture is as big as the room allows', () => {
  const L = Layout.layout(1920, 1080, 4 / 3, false);
  assert.ok(L.screen.h >= 1080 - Layout.HEADER - 16 - 1);
  const P = Layout.layout(821, 1316, 4 / 3, true);
  assert.equal(P.screen.w, 821);
});

test('landscape: the controls sit at both edges, the picture in the middle', () => {
  const L = Layout.layout(1316, 821, 4 / 3, true);
  assert.equal(L.left.x, 0);
  assert.equal(L.right.x + L.right.w, 1316);
  assert.ok(L.screen.x >= L.left.w && L.screen.x + L.screen.w <= L.right.x);
});

test('portrait: the pad sits under the picture and fills the rest of the screen', () => {
  const L = Layout.layout(821, 1316, 4 / 3, true);
  assert.equal(L.pad.y, L.screen.y + L.screen.h);
  assert.equal(L.pad.y + L.pad.h, 1316);
});

test('a wide picture (16:10 DOS modes) also fits', () => {
  for (const [vw, vh] of [[1920, 1080], [1316, 821], [821, 1316]]) {
    const L = Layout.layout(vw, vh, 16 / 10, true);
    assert.ok(Math.abs(L.screen.w / L.screen.h - 1.6) < 0.02);
    assert.ok(inside(L.screen, vw, vh));
  }
});

test('a bad aspect falls back to 4:3', () => {
  for (const bad of [0, -1, NaN, undefined]) {
    const L = Layout.layout(1316, 821, bad, false);
    assert.ok(Math.abs(L.screen.w / L.screen.h - 4 / 3) < 0.02, String(bad));
  }
});
