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
// Sideways, each side column holds its keys in two columns of five rows (three columns of four on a short phone),
// every key at least MIN_KEY: the room must be there before play.css draws them.
const { MIN_KEY, PAD, GAP } = Layout;
const span = (n) => n * MIN_KEY + (n - 1) * GAP + 2 * PAD;
for (const [vw, vh] of [[1316, 821], [1920, 1080], [844, 390], [740, 360]]) {
  test(`${vw}x${vh} sideways: each side column has room for its keys at ${MIN_KEY} px or more`, () => {
    const L = Layout.layout(vw, vh, 4 / 3, true);
    for (const z of [L.left, L.right]) {
      assert.ok(z.cols === 2 || z.cols === 3);
      assert.ok(z.w >= span(z.cols), 'wide enough for ' + z.cols + ' keys');
      const rows = z.cols === 2 ? 5 : 4;
      assert.ok(z.h >= span(rows), 'tall enough for ' + rows + ' rows');
    }
  });
}

// Upright, the pad holds the numbers (two rows on a phone), Space and Enter, and two rows beside the arrows.
for (const [vw, vh, numberRows] of [[821, 1316, 1], [390, 844, 2], [360, 740, 2]]) {
  test(`${vw}x${vh} upright: the pad has room for every row at ${MIN_KEY} px or more`, () => {
    const L = Layout.layout(vw, vh, 4 / 3, true);
    const rows = numberRows + 1 + 2;
    assert.ok(L.pad.h >= rows * MIN_KEY + (rows - 1) * 12 + 2 * PAD, 'tall enough for ' + rows + ' rows');
    const perRow = Math.ceil(9 / numberRows);
    assert.ok(L.pad.w >= span(perRow), 'wide enough for ' + perRow + ' numbers in a row');
  });
}

test('Bryan, 19 Nov 2026, "use the space better": sideways on the tablet the picture is as tall as it can be', () => {
  const L = Layout.layout(1316, 821, 4 / 3, true);
  assert.equal(L.screen.h, 821 - Layout.HEADER - 16);
  assert.ok(L.screen.w * L.screen.h > 774 * 580 * 1.6, 'at least 60% more picture than before (774 x 580)');
  assert.equal(L.left.cols, 2);
});

test('a narrow sideways screen shrinks the picture, never the keys', () => {
  const L = Layout.layout(700, 400, 4 / 3, true);
  assert.ok(L.left.w >= Layout.columnWidth(L.left.cols));
  assert.ok(!Layout.overlaps(L.screen, L.left) && !Layout.overlaps(L.screen, L.right));
});

test('play.css uses the same thresholds as layout.js', () => {
  const css = require('node:fs').readFileSync(path.join(__dirname, '..', 'play.css'), 'utf8');
  const fiveRows = Layout.ROWS * MIN_KEY + (Layout.ROWS - 1) * GAP;          // 320: below it, three columns
  assert.ok(css.includes('@container (max-height:' + (fiveRows - 0.02) + 'px)'), 'side column switch at ' + fiveRows);
  assert.ok(css.includes('minmax(56px'), 'keys never under 56 px');
  assert.match(css, /\.zone\{[^}]*padding:12px/);
  assert.ok(css.includes('gap:10px'));
  assert.equal(Layout.columns(span(5)), 2);
  assert.equal(Layout.columns(span(5) - 1), 3);
});

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

test('whole-site audit D: with the phone\'s safe-area edges, nothing is laid out in the home-bar strip or the side corners', () => {
  // An iPhone: upright the home bar (34 px), sideways the rounded corners (47 px) and the home bar (21 px).
  for (const [vw, vh, ins] of [[390, 844, { t: 0, r: 0, b: 34, l: 0 }], [844, 390, { t: 0, r: 47, b: 21, l: 47 }]]) {
    for (const shell of [false, true]) {
      const L = Layout.layout(vw, vh, 4 / 3, true, 2, false, shell, ins);
      for (const k of ['screen', 'left', 'right', 'pad']) {
        const r = L[k]; if (!r) continue;
        assert.ok(r.x >= ins.l && r.x + r.w <= vw - ins.r, `${vw}x${vh} ${k} x`);
        assert.ok(r.y >= ins.t && r.y + r.h <= vh - ins.b, `${vw}x${vh} ${k} y`);
      }
    }
  }
  // No insets (a computer) gives the same answer as before.
  assert.deepEqual(Layout.layout(844, 390, 4 / 3, true, 2, false, true, { t: 0, r: 0, b: 0, l: 0 }), Layout.layout(844, 390, 4 / 3, true, 2, false, true));
});
