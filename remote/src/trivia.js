// VoidTV phone remote: Trivia Night's adapter (trivia/index.html, the host screen). Licence: GPL-2.0-or-later.
// remote/src/screen.js says what an adapter gives. Loaded by remote/src/follow.js when the big screen comes to Trivia with a remote.
// Bryan, 22 Nov 2026: "work for searching and interacting with the direct play areas of vtv". The phone presses the host screen's
// own buttons (Start, Start the game, Pause and Go on, Play again), only those, only while the screen shows them; and once a game
// has its room, Play on this phone hands the phone to Trivia's own answer page (trivia/phone.html) through /join, with the room's
// four letters only (remote.js, handMsg). The phone's Back button brings it to the remote again.
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.RemoteScreen) return;
  const R = root.RemoteScreen;
  const $ = (id) => document.getElementById(id);
  // The host's buttons the phone may press, by id, and the words on the phone.
  const PRESS = { start: 'Start', begin: 'Start the game', again: 'Play again' };
  const can = (id) => { const b = $(id); return !!(b && !b.hidden && !b.disabled && b.offsetParent !== null); };
  const code = () => (typeof root.TriviaHostRoom === 'function' ? root.TriviaHostRoom() : '') || '';

  const adapter = {
    site: () => ({ name: 'Trivia Night', home: location.origin + '/trivia/', donate: '', kids: false, find: '' }),
    now() {
      const c = code(), acts = [];
      if (c) acts.push({ a: 'hand', l: 'Play on this phone' });
      for (const id of Object.keys(PRESS)) if (can(id)) acts.push({ a: 'press', id, l: PRESS[id] });
      // The question's clock: the host's own Pause button, which says Go on while paused.
      if (can('pause')) acts.push(/go on/i.test($('pause').textContent) ? { a: 'play', l: 'Go on' } : { a: 'pause', l: 'Pause' });
      acts.push({ a: 'area', id: 'live', l: 'Live TV' });
      return { k: 'page', where: 'Trivia Night on the big screen', t: 'Trivia Night',
        s: c ? 'Room ' + c + ' is open. Play on this phone to answer.' : 'Pick the game on the big screen, then Start.', acts };
    },
    lists: () => R.areaList('trivia'),
    info: () => null,
    act(cmd, seat) {
      if (cmd.a === 'press') { if (Object.prototype.hasOwnProperty.call(PRESS, cmd.id) && can(cmd.id)) $(cmd.id).click(); return; }
      if (cmd.a === 'pause' || cmd.a === 'play') {
        const on = can('pause') && /go on/i.test($('pause').textContent);   // paused now
        if ((cmd.a === 'pause') !== on && can('pause')) $('pause').click();
        return;
      }
      if (cmd.a === 'hand') { if (code()) R.hand(seat, code(), 'Trivia Night'); return; }
      if (cmd.a === 'tv') { R.area('live'); return; }
      if (cmd.a === 'area') R.area(cmd.id, (A) => A.id === 'trivia');   // already here
    },
  };
  root.SiteRemote = adapter;
})(typeof self !== 'undefined' ? self : this);
