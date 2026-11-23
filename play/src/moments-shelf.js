// VoidTV PLAY: the moment rows on the front page (Moments, docs/MOMENTS.md). Licence: GPL-2.0-or-later (play/LICENSE).
// What is in the news (Bryan, 22 Nov 2026): the shared engine
// (/assets/brand/moments/moments.js) says which moments are on today and which games each one's PLAY rule picks; this file
// draws them on the front page, first under the banner (under Continue playing when there is one), with the shelf's own
// rowSection so a moment row looks and steers like every other row. shelf.js calls place() once, from show()'s home branch.
// Rules kept here (PLAY lead, 22 Nov 2026): games come from every game on the shelf, not only the main showing; a row is
// never folded to one copy per name (Grand Theft Auto on the PC and on the Game Boy Color are two games of the moment);
// Bryan's banner list (shelf/front-picks.json) is never edited.
(function (root) {
  'use strict';
  // The shelf's games in the engine's one shape (pure: tested).
  const shape = (games) => (Array.isArray(games) ? games : []).map((g) => ({ id: g.id, item: g.item, title: g.title, year: g.year, genres: g.genres, system: g.system, plays: g.plays, wikidata: g.wikidata, game: g }));

  // The moment rows for these games today: [{ id, title, about, ad, games }] (pure given the moments: tested).
  function rowsFrom(moments, games, opts) {
    const M = (opts && opts.engine) || root.VoidMoments;
    if (!M || !M.rows) return [];
    return M.rows(moments, 'play', shape(games), opts).map((r) => ({ id: r.id, title: r.title, about: r.about, ad: r.ad, games: r.items.map((x) => x.game) }));
  }

  // Draw them into the home page's rows. still() says whether this is still the page being shown (a slow answer never lands
  // on a later list). rowSection(title, list, f, count) is the shelf's own.
  function place(rowsEl, games, rowSection, still) {
    const M = root.VoidMoments;
    if (!M || !M.ready || !rowsEl || typeof rowSection !== 'function') return Promise.resolve([]);
    return M.ready.then((moments) => {
      if (still && !still()) return [];
      const made = rowsFrom(moments, games);
      const first = rowsEl.querySelector(':scope > section.row:not(.cont-row)');
      for (const r of made) {
        const sec = rowSection(r.title, r.games, null, r.games.length);
        sec.classList.add('moment-row');
        sec.dataset.moment = r.id;
        // Why the row is there today, in one short line under its title (the PLAY lead, 22 Nov 2026): the rule's about.
        if (r.about) { const h = sec.querySelector('h2'), p = document.createElement('p'); p.className = 'mabout'; p.textContent = r.about; if (h) h.after(p); else sec.prepend(p); }
        rowsEl.insertBefore(sec, first);
      }
      return made;
    }).catch(() => []);
  }

  // The banner opens on each moment that has an ad line and a row today (Bryan, 22 Nov 2026, layout B: "banner + row"). The
  // slide is voidtv.net's own look: no game picture or the game's lettering behind it, the ad line in our type (the PLAY lead:
  // the no-Rockstar-art line covers VoidTV's own promos). It is added at run time; shelf/front-picks.json is never edited.
  // Its button goes to the moment's row. (pure given the moments: tested)
  function slidesFrom(moments, games, opts) {
    return rowsFrom(moments, games, opts).filter((r) => r.ad && r.ad.line).map((r) => {
      const ys = r.games.map((g) => g.year).filter(Boolean), lo = Math.min(...ys), hi = Math.max(...ys);
      const when = !ys.length ? '' : lo === hi ? ', from ' + lo : ', ' + lo + ' to ' + hi;
      return { moment: r.id, kicker: 'In the news', title: r.ad.line, line: r.title + when + ', free to play here.', go: r.ad.go || 'Play them', to: '[data-moment="' + r.id + '"]' };
    });
  }
  // The moments as last read (the banner is drawn at once, so it takes what has arrived; wait() holds the first draw for it).
  let loaded = null;
  if (root.VoidMoments && root.VoidMoments.ready) root.VoidMoments.ready.then((ms) => { loaded = ms; });
  const slides = (games) => (loaded ? slidesFrom(loaded, games) : []);
  // The shelf's first draw waits for the moments at most ms (a slow or missing list never holds PLAY's page longer).
  const wait = (ms) => (root.VoidMoments && root.VoidMoments.ready ? Promise.race([root.VoidMoments.ready, new Promise((ok) => setTimeout(ok, ms))]) : Promise.resolve());

  const api = { shape, rowsFrom, place, slidesFrom, slides, wait };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.PlayMoments = api;
})(typeof self !== 'undefined' ? self : this);
