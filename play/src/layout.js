// VoidTV PLAY: where the picture and the touch pad go. Licence: GPL-2.0-or-later (play/LICENSE).
// One small rule set, so every screen gets the same answer: the picture keeps its shape and is never covered;
// with touch on, landscape puts a column of controls at each side (thumbs at the edges), portrait puts the pad under
// the picture. Sizes are CSS pixels.
(function (root) {
  const HEADER = 52;
  const MIN_KEY = 56;          // smallest touch target we draw (a thumb, not a fingertip)

  function fit(boxW, boxH, aspect) {
    let w = boxW, h = w / aspect;
    if (h > boxH) { h = boxH; w = h * aspect; }
    return { w: Math.floor(w), h: Math.floor(h) };
  }

  function layout(vw, vh, aspect, touch) {
    aspect = aspect > 0 ? aspect : 4 / 3;
    const top = HEADER, stageH = vh - HEADER;
    if (!touch) {
      const s = fit(vw - 32, stageH - 16, aspect);
      return { mode: 'plain', screen: { x: Math.floor((vw - s.w) / 2), y: top + Math.floor((stageH - s.h) / 2), w: s.w, h: s.h } };
    }
    if (vw > vh) {
      const col = Math.round(Math.min(300, Math.max(200, vw * 0.2)));
      const s = fit(vw - 2 * col - 16, stageH - 16, aspect);
      const screen = { x: Math.floor((vw - s.w) / 2), y: top + Math.floor((stageH - s.h) / 2), w: s.w, h: s.h };
      return { mode: 'landscape', screen,
        left: { x: 0, y: top, w: col, h: stageH },
        right: { x: vw - col, y: top, w: col, h: stageH } };
    }
    const s = fit(vw, Math.floor(stageH * 0.5), aspect);
    const screen = { x: Math.floor((vw - s.w) / 2), y: top, w: s.w, h: s.h };
    return { mode: 'portrait', screen, pad: { x: 0, y: top + s.h, w: vw, h: vh - top - s.h } };
  }

  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  const api = { layout, fit, overlaps, HEADER, MIN_KEY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayLayout = api;
})(typeof self !== 'undefined' ? self : this);
