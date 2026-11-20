// VoidTV PLAY: where the picture and the touch pad go. Licence: GPL-2.0-or-later (play/LICENSE).
// One small rule set, so every screen gets the same answer: the picture keeps its shape and is never covered.
// With touch on, sideways: the picture is as tall as the screen allows and the controls fill the columns left at each
// side (thumbs at the edges); the columns are never narrower than two thumb keys, so on a narrow screen the picture
// gives way, not the keys. Upright: the picture fills the width and the pad fills everything under it.
// Sizes are CSS pixels. The numbers here and the columns in play.css (.pcol) are one rule: keep them the same.
(function (root) {
  const HEADER = 52;
  const SHELL = 14;            // the bezel around the picture inside the handheld shell
  const MIN_KEY = 56;          // smallest touch target we draw (a thumb, not a fingertip)
  const PAD = 12;              // a zone's inner margin
  const GAP = 10;              // space between keys
  const ROWS = 5;              // rows of keys a side column needs for two columns (play.css @container)

  // How many key columns a side column uses: two when five rows of keys fit in its height, three when they do not.
  function columns(zoneH) {
    return zoneH - 2 * PAD >= ROWS * MIN_KEY + (ROWS - 1) * GAP ? 2 : 3;
  }
  // The narrowest a side column may be for that many columns of keys.
  const columnWidth = (cols) => 2 * PAD + cols * MIN_KEY + (cols - 1) * GAP;

  function fit(boxW, boxH, aspect) {
    let w = boxW, h = w / aspect;
    if (h > boxH) { h = boxH; w = h * aspect; }
    return { w: Math.floor(w), h: Math.floor(h) };
  }

  // minCols: a console pad three buttons wide (Super Nintendo diamond, Genesis A B C) asks for three key columns a side.
  function layout(vw, vh, aspect, touch, minCols, bare, shell) {
    aspect = aspect > 0 ? aspect : 4 / 3;
    // Controller mode (Bryan, 20 Nov 2026: 'the screen becomes the entire game screen'): a gamepad in hand on a phone or
    // tablet, so no keys and no bar; the picture fills the whole screen, kept to its shape.
    if (bare) {
      const s = fit(vw, vh, aspect);
      return { mode: 'bare', screen: { x: Math.floor((vw - s.w) / 2), y: Math.floor((vh - s.h) / 2), w: s.w, h: s.h } };
    }
    // The handheld shell on a phone (Bryan, 20 Nov 2026: lexROM's Game Boy look, 'Phones, both ways'): the bar steps
    // away during play, so the picture and the keys share the whole screen, the picture inside a bezel.
    const top = shell ? (vw > vh ? 0 : SHELL) : HEADER, stageH = vh - top;
    if (!touch) {
      const s = fit(vw - 32, stageH - 16, aspect);
      return { mode: 'plain', screen: { x: Math.floor((vw - s.w) / 2), y: top + Math.floor((stageH - s.h) / 2), w: s.w, h: s.h } };
    }
    if (vw > vh) {
      const cols = Math.max(columns(stageH), minCols || 2);
      const s = fit(vw - 2 * columnWidth(cols), stageH - (shell ? SHELL : 16), aspect);
      const col = Math.floor((vw - s.w) / 2);
      const screen = { x: col, y: top + Math.floor((stageH - s.h) / 2), w: s.w, h: s.h };
      return { mode: 'landscape', screen,
        left: { x: 0, y: top, w: col, h: stageH, cols },
        right: { x: vw - col, y: top, w: col, h: stageH, cols } };
    }
    const s = fit(vw, Math.floor(stageH * (shell ? 0.56 : 0.5)), aspect);   // upright the width is the limit: edge to edge
    const screen = { x: Math.floor((vw - s.w) / 2), y: top, w: s.w, h: s.h };
    return { mode: 'portrait', screen, pad: { x: 0, y: top + s.h, w: vw, h: vh - top - s.h } };
  }

  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  const api = { layout, fit, overlaps, columns, columnWidth, HEADER, SHELL, MIN_KEY, PAD, GAP, ROWS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayLayout = api;
})(typeof self !== 'undefined' ? self : this);
