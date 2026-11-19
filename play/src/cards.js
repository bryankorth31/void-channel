// VoidTV PLAY: game cards. Licence: GPL-2.0-or-later (play/LICENSE).
// One small JSON per game (Couch Craft's card, translated): which Archive item and file, which core, which program to
// start, the controls the touch pad draws, and the gamepad map the hub uses. The game file is always fetched from the
// Internet Archive at play time; voidtv.net never keeps it.
(function (root) {
  const CORES = { 'dosbox-pure': { engine: 'engine/dosbox-pure.js', systems: ['dos'] } };

  function check(card) {
    const bad = [];
    if (!card || typeof card !== 'object') return ['not a card'];
    if (!/^[a-z0-9-]+$/.test(card.id || '')) bad.push('id');
    if (!card.title) bad.push('title');
    const a = card.archive || {};
    if (!/^[A-Za-z0-9._-]+$/.test(a.item || '')) bad.push('archive.item');
    if (!a.file || /(^|\/)\.\.(\/|$)/.test(a.file)) bad.push('archive.file');
    const core = CORES[card.core];
    if (!core) bad.push('core');
    else if (!core.systems.includes(card.system)) bad.push('system');
    if (!card.controls || !card.controls.kind) bad.push('controls');
    return bad;
  }

  // Through archive.org/cors/: the one Archive address a page on another site may read (FINDINGS 19 Nov 2026).
  function gameUrl(card) {
    return 'https://archive.org/cors/' + card.archive.item + '/' + card.archive.file.split('/').map(encodeURIComponent).join('/');
  }
  const itemPage = (card) => 'https://archive.org/details/' + card.archive.item;
  const gameFile = (card) => card.archive.file.split('/').pop();
  const engineOf = (card) => CORES[card.core].engine;

  const api = { check, gameUrl, itemPage, gameFile, engineOf, CORES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayCards = api;
})(typeof self !== 'undefined' ? self : this);
