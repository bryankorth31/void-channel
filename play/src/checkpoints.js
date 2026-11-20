// VoidTV PLAY: picture checkpoints. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026 ("Yes, ask the lead"; Caitlin reached level 2 of a Mario game, lost her last life and was sent
// back to level 1): while a console game plays, a save point with a small picture of the screen is taken every minute
// of play, and a few are kept, spread out so they reach back about 20 minutes. The pause menu shows them ("4 minutes
// back"); a tap goes back there. It needs to know nothing about a game's levels. Held while the game is open, for the
// game being played (Continue and Save are for coming back later).
(function (root) {
  // One save point a minute is held for the last 24 minutes of play; the menu shows the ones nearest 1, 2, 4, 7, 12 and
  // 20 minutes back (Bryan's six, spread so one is usually near the start of the level you were on).
  const TARGETS = [1, 2, 4, 7, 12, 20];
  const HOLD_MIN = 24;
  const EVERY_S = 60;

  // Pure (tested): the save points still worth holding (play second `at`), given the play second now.
  const hold = (list, now) => list.filter((c) => (now - c.at) / 60 < HOLD_MIN + 0.5);

  // Pure (tested): the ones to show, newest first: for each target, the nearest point not already shown, if it is near
  // enough (a third of the target, at least 45 seconds).
  function pick(list, now) {
    const shown = new Set();
    for (const t of TARGETS) {
      let best = null, gap = Infinity;
      for (const c of list) {
        if (shown.has(c)) continue;
        const d = Math.abs((now - c.at) / 60 - t);
        if (d < gap) { gap = d; best = c; }
      }
      if (best && gap <= Math.max(0.75, t / 3)) shown.add(best);
    }
    return [...shown].sort((a, b) => b.at - a.at);
  }

  // "1 minute back", "4 minutes back"; under a minute, "Just now".
  function label(secondsBack) {
    const m = Math.round(secondsBack / 60);
    return m < 1 ? 'Just now' : m === 1 ? '1 minute back' : m + ' minutes back';
  }

  // A small picture of the game's screen (the canvas at its own size, made about 160 px wide).
  function thumb(canvas) {
    try {
      const w = 160, h = Math.max(1, Math.round(160 * canvas.height / Math.max(1, canvas.width)));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(canvas, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  }

  const api = { TARGETS, HOLD_MIN, EVERY_S, hold, pick, label, thumb, KEY: 'checkpoints' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayCheckpoints = api;
})(typeof self !== 'undefined' ? self : this);
