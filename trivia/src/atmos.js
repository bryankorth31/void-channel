// VoidTV Trivia Nights: the background moves with the scroll the way voidtv.net's does (Bryan, 20 Nov 2026: "use these with the
// other lighting type bg that voidtv uses and treat in the same way with how it scrolls"). VoidTV's own rule (scripts/lib/app.js,
// the .atmos layer; PLAY's shelf uses it too): the picture drifts up as the page goes down, with two slow swells, and grows a
// little; the soft void floats and turns with it. Still on a phone or a touch screen (it costs battery there), and for anyone who
// asks for less motion; the grain and the void's turn rest while the tab is hidden. Licence: GPL-2.0-or-later.
(function atmos() {
  'use strict';
  if (typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bg = document.querySelector('.atmos .bgimg'), vd = document.querySelector('.atmos .void');
  if (!bg) return;
  const light = () => innerWidth <= 700 || matchMedia('(pointer: coarse)').matches;
  function frame() {
    const y = window.scrollY, h = Math.max(1, document.documentElement.scrollHeight - innerHeight), f = Math.min(1, y / h);
    const w = Math.sin(y / 700), w2 = Math.sin(y / 430);
    if (light()) { bg.style.transform = ''; if (vd) vd.style.transform = ''; return; }
    bg.style.transform = 'translate3d(0,' + (-f * 60 + w * 22) + 'px,0) scale(' + (1.06 + f * 0.05 + w2 * 0.015) + ')';
    if (vd) vd.style.transform = 'translate3d(' + (w2 * 60) + 'px,' + (-f * 120 + w * 90) + 'px,0) rotate(' + (y * 0.06) + 'deg) scale(' + (1.05 + w2 * 0.12) + ')';
  }
  let last = -1;
  (function loop() { const y = window.scrollY; if (y !== last) { last = y; frame(); } requestAnimationFrame(loop); })();
  addEventListener('resize', () => { last = -1; });
  document.addEventListener('visibilitychange', () => {
    for (const e of document.querySelectorAll('.atmos .grain, .atmos .void i')) e.style.animationPlayState = document.hidden ? 'paused' : 'running';
  });
})();
