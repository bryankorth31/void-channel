// VoidTV phone remote: PLAY's adapter, for the game shelf (play/index.html) and a game (play/game.html). Licence: GPL-2.0-or-later.
// remote/src/screen.js says what an adapter gives. Loaded by remote/src/follow.js when the big screen comes to PLAY with a remote.
// Bryan, 22 Nov 2026: "work for searching and interacting with the direct play areas of vtv". From the pictures he picked P1: the
// phone lists and searches PLAY's games; a tap starts one on the big screen and the phone becomes its controller. That is PLAY's
// own phone pad (play/pad.html) in PLAY's own room (kind pad), which the shelf opens and the game page takes back (src/phones.js,
// src/shelf-phones.js). The phone is told only the pad room's four letters (r-hand) and goes there through /join; its Back button
// brings it to the remote again. Phone as controller does the same without a game: the pad steers the shelf (d-pad, A plays).
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || !root.RemoteScreen) return;
  const R = root.RemoteScreen;
  const onGame = /\/game(\.html)?$/.test(location.pathname);
  // The shelf's own list (play/shelf/index.json, as the shelf draws it), most played first.
  let games = [], byId = new Map();
  const popular = (a, b) => (b.plays || 0) - (a.plays || 0) || (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title));
  fetch('shelf/index.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
    games = (j.games || []).filter((g) => g && root.VoidRemote.idOk(g.id) && g.title).sort(popular);
    byId = new Map(games.map((g) => [g.id, g]));
    R.changed();
  }).catch(() => { /* no list: the phone shows the areas, and Phone as controller still works */ });
  const SYS = () => (root.PlayShelf && root.PlayShelf.SYSTEMS) || {};
  const sysName = (g) => (SYS()[g.system] && SYS()[g.system].name) || String(g.system || '').toUpperCase();
  const row = (g) => ({ id: g.id, t: g.title, s: [sysName(g), g.year].filter(Boolean).join(' · ') });
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // The game page's own address for a game, as the shelf makes it (src/shelf.js, hrefOf): from the shelf's list, never the phone's.
  const hrefOf = (g) => 'game.html?game=' + encodeURIComponent(g.id) + (g.b ? '&b=' + encodeURIComponent(g.b) : '');
  const here = () => (onGame ? byId.get(new URLSearchParams(location.search).get('game') || '') : null);

  // The pad room's code: on the shelf, the shelf's own phone room (opened now if it is not open yet); on a game page, the room
  // the game holds, or the game's own Phones button opens one (its panel shows a moment, then closes again).
  function padCode() {
    if (!onGame) return root.PlayShelfPhones ? root.PlayShelfPhones.open().then((r) => (r ? r.code : '')) : Promise.resolve('');
    const k = root.PlayPhones && root.PlayPhones.kept();
    if (k) return Promise.resolve(k.code);
    const b = document.getElementById('b-phones');
    if (!b || b.hidden) return Promise.resolve('');
    b.click();
    return new Promise((ok) => {
      let n = 0;
      const t = setInterval(() => {
        const k2 = root.PlayPhones.kept();
        if (k2 || ++n > 25) { clearInterval(t); const x = document.getElementById('phones-close'); if (x && k2) x.click(); ok(k2 ? k2.code : ''); }
      }, 200);
    });
  }
  // Hand one phone over to the pad, then (then) go on: on the shelf, once the phone is in the pad room (or after 8 s), so the
  // game page takes the room back with the phone already in its seat.
  function handOver(seat, then) {
    return padCode().then((code) => {
      if (!code || !R.hand(seat, code, 'the game controller')) { if (then) then(); return; }
      if (!then) return;
      const had = root.PlayShelfPhones ? root.PlayShelfPhones.count() : 0, t0 = Date.now();
      const t = setInterval(() => {
        if ((root.PlayShelfPhones && root.PlayShelfPhones.count() > had) || Date.now() - t0 > 8000) { clearInterval(t); then(); }
      }, 200);
    }).catch(() => { if (then) then(); });
  }

  const adapter = {
    site: () => ({ name: 'PLAY', home: location.origin + '/play/', donate: '', kids: false, find: 'Search games' }),
    now() {
      const g = here();
      if (onGame) {
        return { k: 'page', where: 'PLAY on the big screen', t: g ? g.title : 'A game', s: g ? [sysName(g), g.year].filter(Boolean).join(' · ') : '',
          acts: [{ a: 'hand', l: 'Phone as controller' }, { a: 'area', id: 'play', l: 'Back to the games' }, { a: 'area', id: 'live', l: 'Live TV' }] };
      }
      return { k: 'page', where: 'PLAY on the big screen', t: 'Pick a game', s: 'Tap one to play it on the big screen: this phone becomes its controller.',
        acts: [{ a: 'hand', l: 'Phone as controller' }, { a: 'area', id: 'live', l: 'Live TV' }] };
    },
    lists: () => (games.length ? [{ id: 'games', title: 'Most played', a: 'game', on: (here() || {}).id || '', items: games.slice(0, 60).map(row) }] : []).concat(R.areaList('play')),
    info: () => null,
    // The shelf's search: the words in a game's name or its maker's, most played first; names that start with them come first.
    find(q) {
      const w = fold(q).trim();
      if (!w) return null;
      const hits = root.VoidRemote.rankFind(games.filter((g) => fold(g.title + ' ' + (g.publisher || '')).includes(w)), w, 40);
      return { id: 'find', a: 'game', title: hits.length ? 'Found: "' + String(q).trim() + '"' : 'No game found for "' + String(q).trim() + '"', items: hits.map(row) };
    },
    act(cmd, seat) {
      if (cmd.a === 'game') {
        const g = byId.get(cmd.id); if (!g) return;
        if (onGame) { location.assign(hrefOf(g)); return; }   // from one game to another; the pad room goes with the tab
        handOver(seat, () => location.assign(hrefOf(g)));
        return;
      }
      if (cmd.a === 'hand') { handOver(seat, null); return; }
      if (cmd.a === 'tv') { R.area('live'); return; }
      if (cmd.a === 'area') R.area(cmd.id, (A) => A.id === 'play' && !onGame);   // PLAY from the shelf: already here
    },
  };
  root.SiteRemote = adapter;
})(typeof self !== 'undefined' ? self : this);
