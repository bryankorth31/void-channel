// VoidTV PLAY: the phone controller on the shelf. Licence: GPL-2.0-or-later (play/LICENSE).
// Bryan, 20 Nov 2026: "i want to able to connect the phone as the controller prior to being in a game, and the phone
// should also be able to be used as a remote". On the shelf a phone scans the code and steers the shelf as a gamepad
// does (the d-pad moves, A picks a game up and plays it, B goes back); when a game opens, the game page takes the same
// room back (src/phones.js keeps it for this tab), so the phone stays connected and becomes the game's controller.
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.PlayPhones) return;
  const $ = (id) => document.getElementById(id);
  // What the phone shows while it is a remote.
  const REMOTE = { type: 'card', title: 'PLAY: pick a game', buttons: { A: 'Pick up, then Play', B: 'Back', Start: 'Pick up, then Play' }, dpad: true };
  let phones = null;

  function list(items) {
    const ul = $('phones-list'); if (!ul) return;
    ul.textContent = '';
    for (const p of items) { const li = document.createElement('li'); li.textContent = 'Phone ' + p.seat + ' connected'; ul.appendChild(li); }
    if (!items.length) { const li = document.createElement('li'); li.textContent = 'No phones yet'; ul.appendChild(li); }
    const b = $('b-phones'); if (b) b.classList.toggle('on', items.length > 0);
  }
  function start(resumeOnly) {
    if (!phones) phones = root.PlayPhones.create({ card: () => REMOTE, change: list });
    return phones.open(resumeOnly).then((r) => {
      if (!r) return null;
      $('phones-code').textContent = r.code; $('phones-site').textContent = location.host + '/join';
      if (root.PlayQR) $('phones-qr').innerHTML = root.PlayQR.svg(r.join, 8);
      list(phones.list());
      return r;
    });
  }
  function show(open) {
    $('phones').hidden = !open; $('b-phones').setAttribute('aria-expanded', String(open));
    if (!open) return;
    $('phones-code').textContent = '....';
    start(false).catch((e) => { $('phones-code').textContent = ''; $('phones-err').textContent = e.message; });
  }
  function init() {
    if (!$('b-phones')) return;
    $('b-phones').onclick = () => show($('phones').hidden);
    $('phones-close').onclick = () => show(false);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('phones').hidden) show(false); });
    addEventListener('pagehide', () => { if (phones) phones.close(); });   // the room waits for the game page
    if (root.PlayPhones.kept()) start(true).catch(() => {});                 // a phone from a game before: still here
  }
  // The shelf's gamepad loop reads these with the real gamepads (src/shelf.js).
  root.PlayShelfPads = () => (phones ? phones.pads() : []);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof self !== 'undefined' ? self : this);
