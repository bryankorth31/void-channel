// VoidTV phone remote: the room follows the big screen to voidtv.net's play areas. Licence: GPL-2.0-or-later.
// Bryan, 22 Nov 2026: "the phone remote needs to have pause on it and also work for searching and interacting with the direct play
// areas of vtv". The remote is opened on Live TV (Phone remote); its room is kept for this tab (screen.js, sessionStorage), and a
// page of this same site takes it back within 45 seconds, phones still in their seats. This small file is on each area's page
// (PLAY's shelf and game page, Trivia's host page): when this tab holds a remote room, it loads the remote and that area's adapter
// (data-area: play.js, trivia.js) and takes the room back. A tab that holds none loads nothing more.
//   <script src="/remote/src/follow.js" defer data-area="play"></script>
(function (root) {
  'use strict';
  let held = null;
  try { held = sessionStorage.getItem('voidtv-remote-room'); } catch (e) { return; }
  if (!held) return;
  const me = document.currentScript, area = me ? me.getAttribute('data-area') : '';
  if (area !== 'play' && area !== 'trivia') return;
  // The build stamps this file's address (?v=, scripts/site.js and scripts/trivia/stamp.js); the files it loads carry the same,
  // so a push reaches a big screen at once, never yesterday's screen.js beside today's phone page.
  const v = ((me && me.src.match(/[?&]v=([0-9a-z]{1,40})/)) || [])[1];
  const load = (f) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = f + (v ? '?v=' + v : ''); s.onload = ok; s.onerror = () => no(new Error(f)); document.head.appendChild(s); });
  // The shared area list too, where the page has none of its own (a PLAY game page): Back to the games and Live TV use it. On a
  // page with no menu slot it draws nothing.
  const files = [root.PlayQR ? '' : '/play/src/qr.js', root.VoidAreas ? '' : '/assets/brand/areas/areas.js', '/remote/src/remote.js', '/remote/src/screen.js', '/remote/src/' + area + '.js'].filter(Boolean);
  const go = () => files.reduce((p, f) => p.then(() => load(f)), Promise.resolve())
    .then(() => { if (root.RemoteScreen && root.SiteRemote) root.RemoteScreen.start(root.SiteRemote, true); })
    .catch(() => { /* the remote did not load here: the phones see the big screen away, and it ends in 45 s */ });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})(typeof self !== 'undefined' ? self : this);
