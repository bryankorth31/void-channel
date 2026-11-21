// VoidTV phone remote: voidtv.net's adapter (remote/src/screen.js says what an adapter gives). Licence: GPL-2.0-or-later.
// It reads the page's own Live TV state (scripts/lib/app.js: TV, TVCUR, SHOWS, chanNow, TVG) and acts through the page's own
// calls (tune, surf, tvNow, go), so the phone does exactly what the page's buttons do and the schedule stays the clock's
// (full hold: a phone can change channel, never start anything early). Loaded only when someone presses Phone remote.
(function (root) {
  'use strict';
  /* global TV, TVCUR, TVLIB, TVG, SHOWS, BY_SLUG, ME, SITE, DONATE, state, chanNow, viewNow, tvLive, tune, surf, tvNow, go, urlFor, clock */
  if (typeof document === 'undefined' || !root.RemoteScreen) return;
  const has = (f) => typeof f === 'function';
  const chans = () => (typeof TV !== 'undefined' && TV ? TV.filter((c) => !c.adult || ME.adult) : []);
  const epCode = (se, n) => 'S' + String(se).padStart(2, '0') + 'E' + String(n).padStart(2, '0');
  const epName = (s, se, n) => { for (const z of (s && s.seasons) || []) if (z.season === se) for (const e of z.episodes || []) if (e.n === n) return e.name || ''; return ''; };
  const onTv = () => { const v = has(viewNow) ? viewNow() : ''; return (v === 'tv' || v === 'home') && has(tvLive) && tvLive(); };
  const showUrl = (slug) => location.origin + (has(urlFor) ? urlFor(slug) : '/show/' + slug);

  const adapter = {
    site: () => ({ name: typeof SITE === 'string' ? SITE : location.host, home: location.origin, donate: typeof DONATE === 'string' ? DONATE : '', kids: false }),

    now() {
      const T = typeof TVCUR !== 'undefined' ? TVCUR : null;
      if (onTv() && T && T.c && T.a) {
        const c = T.c, a = T.a, s = SHOWS[a.s], x = T.x || {}, t = Date.now();
        const nx = TVG.nextAiring(c, TVLIB, a), ns = nx && SHOWS[nx.s];
        const next = nx ? 'Next: ' + clock(nx.st) + ' ' + (ns ? ns.show : '') : '';
        if (x.k === 'ep' && s) {
          const cur = T.cur || { se: a.se, n: a.n }, name = epName(s, cur.se, cur.n);
          return { k: 'tv', where: 'Now on ' + c.name, t: s.show, s: epCode(cur.se, cur.n) + (name ? ' · ' + name : ''), nx: next,
            left: (a.st + a.du * 6e4 - t) / 1000, slug: s.slug, art: s.poster || '',
            acts: [{ a: 'ch', l: 'CH' }, { a: 'info', l: 'About' }] };
        }
        // A break: the cards, or a short between shows. Watch it now plays the coming show On Demand, as the card's button does.
        return { k: 'tv', where: 'Break on ' + c.name, t: ns ? 'Up next: ' + ns.show : 'A short break', s: nx ? 'Starts at ' + clock(nx.st) : '',
          nx: '', left: nx ? (nx.st - t) / 1000 : null, slug: ns ? ns.slug : '', art: (ns && ns.poster) || '',
          acts: [{ a: 'ch', l: 'CH' }].concat(ns ? [{ a: 'now', l: 'Watch it now' }, { a: 'info', l: 'About' }] : []) };
      }
      const s = state && state.show;
      if (s && !state.view) {
        return { k: 'show', where: 'On Demand', t: s.show, s: [s.year, s.network, s.eps ? s.eps + ' episodes' : ''].filter(Boolean).join(' · '),
          slug: s.slug, art: s.poster || '', acts: [{ a: 'info', l: 'About' }, { a: 'tv', l: 'Live TV' }] };
      }
      return { k: 'page', where: typeof SITE === 'string' ? SITE : '', t: 'Pick a channel', s: 'The big screen is not on Live TV right now.',
        acts: [{ a: 'tv', l: 'Live TV' }] };
    },

    // Every channel and what is on it now (the guide's On now, as words).
    lists() {
      const L = chans(); if (!L.length) return [];
      const t = Date.now();
      const items = L.map((c) => { const n = chanNow(c, t), s = n && SHOWS[n.a.s]; return { id: c.id, t: c.name, s: s ? s.show : '' }; });
      return [{ id: 'chans', title: 'On now', items, on: onTv() ? state.chan : '' }];
    },

    info(slug) {
      const s = typeof BY_SLUG !== 'undefined' && Object.prototype.hasOwnProperty.call(BY_SLUG, slug) ? BY_SLUG[slug] : null;
      if (!s || (s.adult && !ME.adult)) return null;
      return { slug: s.slug, t: s.show, sub: [s.year, s.network, s.seasonCount ? s.seasonCount + ' season' + (s.seasonCount === 1 ? '' : 's') : '', s.eps ? s.eps + ' episodes' : ''].filter(Boolean).join(' · '),
        ppl: s.people || '', about: s.overview || '', url: showUrl(s.slug) };
    },

    act(cmd) {
      const toTv = (id) => { state.tvOn = true; go(id ? 'tv/' + id : 'tv'); };
      if (cmd.a === 'ch') { if (onTv()) surf(cmd.dir); else toTv(state.chan); return; }
      if (cmd.a === 'tune') { if (!chans().some((c) => c.id === cmd.id)) return; if (onTv()) tune(cmd.id); else toTv(cmd.id); return; }
      if (cmd.a === 'now') { if (onTv()) tvNow(); return; }
      if (cmd.a === 'tv') { toTv(state.chan); return; }
      if (cmd.a === 'go') { if (typeof BY_SLUG !== 'undefined' && Object.prototype.hasOwnProperty.call(BY_SLUG, cmd.slug)) go(cmd.slug); }
    },
  };
  root.SiteRemote = adapter;   // the name every site's adapter takes; the page passes it to RemoteScreen.start
})(typeof self !== 'undefined' ? self : this);
