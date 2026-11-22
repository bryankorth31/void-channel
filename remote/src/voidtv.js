// VoidTV phone remote: voidtv.net's adapter (remote/src/screen.js says what an adapter gives). Licence: GPL-2.0-or-later.
// It reads the page's own Live TV state (scripts/lib/app.js: TV, TVCUR, SHOWS, chanNow, TVG) and acts through the page's own
// calls (tune, surf, tvNow, go), so the phone does exactly what the page's buttons do and the schedule stays the clock's
// (full hold: a phone can change channel, never start anything early). Loaded only when someone presses Phone remote.
// Bryan, 22 Nov 2026: "the phone remote needs to have pause on it and also work for searching and interacting with the direct play
// areas of vtv". Pause and Play are the player's own (the page's play button does the same); on Live TV he picked L1 from the
// pictures: Pause holds this TV's picture only, Play goes on from where it paused, behind the channel, and Back to live takes it
// to where the clock is. Nothing starts early, and the next show still starts at its time (the break after a long pause is shorter,
// or this TV joins the next show where the clock is). Search is the site's own (qHit in scripts/lib/app.js).
(function (root) {
  'use strict';
  /* global gated, TV, TVCUR, TVC_NOW, TVLIB, TVG, SHOWS, BY_SLUG, ME, SITE, DONATE, TRIVIA, BASE, VP, state, chanNow, viewNow, tvLive, tune, surf, tvNow, tvPlay, go, watch, next, nextEp, qHit, urlFor, clock */
  if (typeof document === 'undefined' || !root.RemoteScreen) return;
  const has = (f) => typeof f === 'function';
  const chans = () => (typeof TV !== 'undefined' && TV ? TV.filter((c) => !c.adult || ME.adult) : []);
  const epCode = (se, n) => 'S' + String(se).padStart(2, '0') + 'E' + String(n).padStart(2, '0');
  const epName = (s, se, n) => { for (const z of (s && s.seasons) || []) if (z.season === se) for (const e of z.episodes || []) if (e.n === n) return e.name || ''; return ''; };
  const onTv = () => { const v = has(viewNow) ? viewNow() : ''; return (v === 'tv' || v === 'home') && has(tvLive) && tvLive(); };
  const showUrl = (slug) => location.origin + (has(urlFor) ? urlFor(slug) : '/show/' + slug);
  // The player as the remote sees it: an episode in it (not the idle player of a show page), and whether it is paused.
  const vp = () => (typeof VP !== 'undefined' && VP && VP.v && VP.ep ? VP : null);
  const pp = (p) => (p.v.paused ? { a: 'play', l: 'Play' } : { a: 'pause', l: 'Pause' });
  const open = (slug) => typeof BY_SLUG !== 'undefined' && Object.prototype.hasOwnProperty.call(BY_SLUG, slug) && !(typeof gated === 'function' ? gated(BY_SLUG[slug]) : BY_SLUG[slug].adult && !ME.adult);
  const V0 = root.VoidRemote;

  const adapter = {
    site: () => ({ name: typeof SITE === 'string' ? SITE : location.host, home: location.origin, donate: typeof DONATE === 'string' ? DONATE : '', kids: false, find: 'Search shows and movies' }),

    now() {
      const T = typeof TVCUR !== 'undefined' ? TVCUR : null;
      if (onTv() && T && T.c && T.a) {
        const c = T.c, a = T.a, s = SHOWS[a.s], x = T.x || {}, t = Date.now();
        const nx = TVG.nextAiring(c, TVLIB, a), ns = nx && SHOWS[nx.s];
        const next = nx ? 'Next: ' + clock(nx.st) + ' ' + (ns ? ns.show : '') : '';
        if (x.k === 'ep' && s) {
          const cur = T.cur || { se: a.se, n: a.n }, name = epName(s, cur.se, cur.n), p = vp();
          // Paused, or behind the clock: how far behind, from where the clock says the airing is and where this picture is.
          const bh = p ? V0.behind((t - a.st) / 1000, p.v.currentTime) : null, late = bh !== null && bh > V0.BEHIND_S;
          const paused = !!(p && p.v.paused);
          // The time left runs to the next show, as the line under the picture counts it (night audit N13: one meaning on both).
          return { k: 'tv', where: (paused ? 'Paused on ' : 'Now on ') + c.name, t: s.show,
            s: epCode(cur.se, cur.n) + (name ? ' · ' + name : '') + (late ? ' · ' + V0.behindWords(bh) : ''), nx: next,
            left: (a.en - t) / 1000, slug: s.slug, art: s.poster || '',
            acts: [{ a: 'ch', l: 'CH' }].concat(p ? [paused ? { a: 'play', l: late ? 'Play from here' : 'Play' } : { a: 'pause', l: 'Pause' }] : [],
              late ? [{ a: 'live', l: 'Back to live' }] : [], [{ a: 'info', l: 'About' }]) };
        }
        // A break: the cards, or a short between shows. Watch it now plays the coming show On Demand, as the card's button does.
        return { k: 'tv', brk: true, where: 'Break on ' + c.name, t: ns ? 'Up next: ' + ns.show : 'A short break', s: nx ? 'Starts at ' + clock(nx.st) : '',
          nx: '', left: nx ? (nx.st - t) / 1000 : null, slug: ns ? ns.slug : '', art: (ns && ns.poster) || '',
          acts: [{ a: 'ch', l: 'CH' }].concat(ns ? [{ a: 'now', l: 'Watch it now' }, { a: 'info', l: 'About' }] : []) };
      }
      // Live TV, not turned on yet (a page load waits for Turn on): the phone's Turn on does what that button does.
      if (onTv() && !(T && T.c)) return { k: 'page', where: 'Live TV', t: 'Live TV is off', s: 'Turn it on from this phone.', acts: [{ a: 'tv', l: 'Turn on' }] };
      const s = state && state.show;
      if (s && !state.view) {
        // An episode in the player: what it is, Pause or Play, the next one. The time left is the episode's, and stops while paused.
        const p = vp(), c = p && p._cur && p._cur.slug === s.slug ? p._cur : null;
        const se = c && s.seasons && s.seasons[c.se], ep = se && se.episodes && se.episodes[c.e];
        if (c && ep) {
          return { k: 'show', where: p.v.paused ? 'Paused, On Demand' : 'On Demand', t: s.show, s: epCode(se.season, ep.n) + (ep.name ? ' · ' + ep.name : ''),
            left: p.v.paused || !p.duration ? null : p.duration - p.currentTime, slug: s.slug, art: s.poster || '',
            acts: [pp(p)].concat(has(nextEp) && nextEp() ? [{ a: 'press', id: 'next', l: 'Next episode' }] : [], [{ a: 'info', l: 'About' }, { a: 'tv', l: 'Live TV' }]) };
        }
        return { k: 'show', where: 'On Demand', t: s.show, s: [s.year, s.network, s.eps ? s.eps + ' episodes' : ''].filter(Boolean).join(' · '),
          slug: s.slug, art: s.poster || '', acts: [{ a: 'watch', slug: s.slug, l: 'Play' }, { a: 'info', l: 'About' }, { a: 'tv', l: 'Live TV' }] };
      }
      return { k: 'page', where: typeof SITE === 'string' ? SITE : '', t: 'Pick a channel', s: 'The big screen is not on Live TV right now.',
        acts: [{ a: 'tv', l: 'Live TV' }] };
    },

    // Every channel and what is on it now (the guide's On now, as words).
    lists() {
      const L = chans(); if (!L.length) return [];
      const t = Date.now();
      const items = L.map((c) => { const n = chanNow(c, t), s = n && SHOWS[n.a.s]; return { id: c.id, t: c.name, s: s ? s.show : '' }; });
      return [{ id: 'chans', title: 'On now', items, on: onTv() ? state.chan : '' }].concat(root.RemoteScreen.areaList(onTv() ? 'live' : 'ondemand'));
    },

    // The site's own search (qHit, as the list page asks it), past the adult door, the most episodes first as the list page sorts;
    // names that start with the words, then names that have them, then the rest (remote.js, rankFind).
    find(q) {
      const w = String(q || '').trim().toLowerCase();
      if (!w || typeof qHit !== 'function' || typeof SHOWS === 'undefined') return null;
      const hits = SHOWS.filter((s) => s && s.slug && !(typeof gated === 'function' ? gated(s) : s.adult && !ME.adult) && qHit(s, w)).sort((a, b) => (b.eps || 0) - (a.eps || 0));
      const items = V0.rankFind(hits, w, 40).map((s) => ({ id: s.slug, t: s.show, s: [/^movie-/.test(s.slug) ? 'Movie' : '', s.year, s.network].filter(Boolean).join(' · ') }));
      return { id: 'find', title: items.length ? 'Found: "' + String(q).trim() + '"' : 'Nothing found for "' + String(q).trim() + '"', a: 'go', items };
    },

    info(slug) {
      const s = typeof BY_SLUG !== 'undefined' && Object.prototype.hasOwnProperty.call(BY_SLUG, slug) ? BY_SLUG[slug] : null;
      // The page's own adult door (gated: adult, or a Late Night type or tag, while the door is closed; night audit, 21 Nov 2026).
      if (!s || (typeof gated === 'function' ? gated(s) : (s.adult && !ME.adult))) return null;
      return { slug: s.slug, t: s.show, sub: [s.year, s.network, s.seasonCount ? s.seasonCount + ' season' + (s.seasonCount === 1 ? '' : 's') : '', s.eps ? s.eps + ' episodes' : ''].filter(Boolean).join(' · '),
        ppl: s.people || '', about: s.overview || '', url: showUrl(s.slug) };
    },

    act(cmd) {
      const toTv = (id) => { state.tvOn = true; go(id ? 'tv/' + id : 'tv'); };
      if (cmd.a === 'ch') { if (onTv()) surf(cmd.dir); else toTv(state.chan); return; }
      if (cmd.a === 'tune') { if (!chans().some((c) => c.id === cmd.id)) return; if (onTv()) tune(cmd.id); else toTv(cmd.id); return; }
      if (cmd.a === 'now') { if (onTv()) tvNow(); return; }
      if (cmd.a === 'tv') { toTv(state.chan); return; }
      if (cmd.a === 'go') { if (open(cmd.slug)) go(cmd.slug); return; }
      // Pause and Play: the player's own (the same as its play button). Play on a show page with nothing in the player starts the
      // show where this home left off (watch), as the page's own Play does.
      if (cmd.a === 'pause') { const p = vp(); if (p && !p.v.paused) p.pause(); return; }
      if (cmd.a === 'play') { const p = vp(); if (p) { if (p.v.paused) p.play(); } else if (state.show && !state.view && open(state.show.slug)) watch(state.show.slug); return; }
      if (cmd.a === 'watch') { if (open(cmd.slug)) watch(cmd.slug); return; }
      // Back to live: the channel plays what the clock says now (tvPlay at this moment, as a channel change does).
      if (cmd.a === 'live') { const T = typeof TVCUR !== 'undefined' ? TVCUR : null; if (onTv() && T && T.c && has(tvPlay)) tvPlay(T.c, false); return; }
      if (cmd.a === 'press') { if (cmd.id === 'next' && has(nextEp) && nextEp() && has(next)) next(); return; }
      // An area of the shared menu: On Demand and Live TV are this page's own; any other goes through the menu's list.
      if (cmd.a === 'area') root.RemoteScreen.area(cmd.id, (A) => { if (A.id === 'live') { toTv(state.chan); return true; } if (A.id === 'ondemand') { go(''); return true; } return false; });
    },

    // Trivia, as the phones need it: in a break, the question the break card shows (scripts/lib/app.js, tvSpot); during the
    // show, a pop-up (remote.js, popAt) with only a small icon on the big screen and the question on the phones.
    quiz() {
      const d = typeof TVC_NOW !== 'undefined' ? TVC_NOW : null, sp = d && d.spot;
      if (sp && sp.kind === 'trivia' && onTv()) {
        popIcon(null);
        const q = sp.q;
        return { n: sp.n, show: sp.show, q: q.q, choices: q.choices, answer: q.answer, phase: sp.phase, endsAt: sp.endsAt, msTotal: sp.msTotal, src: q.source || null };
      }
      const z = popQuiz();
      popIcon(z);
      return z;
    },
  };

  // ---- Pop-ups during the show (Bryan, 20 Nov 2026: "a small vtv icon we make for trivia to pop up and then on the phone/
  // device connected from the ppl the info pops up to not obscure") ----
  // Only while phones are in the room (the icon says "look at your phone"), never on kids channels. The question is the clip
  // chat's line just said, if one is approved for this moment (trivia/src/timed.js), else one about the show as a whole that
  // gives nothing away (trivia/src/live.js, during), the same for everyone on the channel at that moment.
  const V = root.VoidRemote;
  const MOMENTS = {};
  function popQuiz() {
    const T = typeof TVCUR !== 'undefined' ? TVCUR : null;
    if (!onTv() || !T || !T.c || !T.a || !T.x || T.x.k !== 'ep' || !root.RemoteScreen.phones) return null;
    if (typeof TRIVIA === 'undefined' || !TRIVIA || (has(root.tvKids) && root.tvKids(T.c, T.a))) return null;
    const c = T.c, a = T.a, s = SHOWS[a.s], t = Date.now();
    const w = s && V.popAt(a.st, a.st + a.du * 6e4, t);
    if (!w) return null;
    const key = c.id + '|' + a.st + '|' + w.i;
    if (!(key in MOMENTS)) { MOMENTS[key] = null; fetchMoment(key, s, a, T.cur || { se: a.se, n: a.n }); }
    const m = MOMENTS[key];
    if (!m) return null;
    return { n: m.n, show: s.show, q: m.q.q, choices: m.q.choices, answer: m.q.answer, phase: t < w.close ? 'q' : 'a', endsAt: w.close, msTotal: w.close - w.start, src: m.q.source || null, pop: true };
  }
  function fetchMoment(key, s, a, cur) {
    if (Object.keys(MOMENTS).length > 100) for (const k in MOMENTS) if (k !== key) delete MOMENTS[k];
    const at = typeof VP !== 'undefined' && VP && VP.v ? VP.v.currentTime : NaN;
    const timed = () => root.jsLoad(['trivia/src/timed.js']).then(() => (root.TriviaTimed && Number.isFinite(at) ? root.TriviaTimed.momentQuestion({ slug: s.slug, season: cur.se, number: cur.n, at }) : null)).catch(() => null);
    const live = () => root.jsLoad(['trivia/src/game.js', 'trivia/src/live.js']).then(() => root.TriviaLive.liveQuestion({ slug: s.slug, season: a.se, number: a.n, seed: key, during: true }, BASE + 'trivia/bank/'));
    // Only "Finish the line" fits a 40-second pop-up. The clip chat's spot-it and whodunit rounds keep their own clock (a whodunit
    // must not show its answer before its reveal), so they wait for their own place (the watch party plan), and this asks live.js.
    timed().then((q) => (q && q.round === 'finish-line' ? q : live())).then((q) => { if (q && q.choices && q.choices.length >= 2) MOMENTS[key] = { n: root.TriviaLive ? root.TriviaLive.hash(key) % 1e9 : 0, q }; }).catch(() => {});
  }

  // The icon: small, in the picture's top corner, a slow fade in and out (no flashing). It counts the phones that answered,
  // then the ones that got it. Clicking it shows the remote's code, so another phone can join. ICON is the one setting for
  // its look: the little neon TV as HQ shows it in its header (Bryan, 20 Nov 2026: "the lil neon tv used in the hq"), the
  // site's own icon in a circle.
  const ICON = '<img src="' + (typeof BASE === 'string' ? BASE : '/') + 'assets/brand/icon-192.png" alt="">';
  const ICON_CSS = '.vtv-pop{position:absolute;top:14px;right:14px;z-index:30;width:52px;height:52px;cursor:pointer;opacity:0;transition:opacity .8s ease;pointer-events:none}'
    + '.vtv-pop.vtv-pop-on{opacity:1;pointer-events:auto}.vtv-pop img{width:100%;height:100%;display:block;border-radius:50%;filter:drop-shadow(0 2px 10px rgba(0,0,0,.6))}'
    + '.vtv-pop i{position:absolute;right:0;top:100%;margin-top:4px;white-space:nowrap;font:700 12px system-ui,sans-serif;font-style:normal;color:#fff;background:rgba(7,8,12,.75);border-radius:999px;padding:2px 8px}'
    + '.vtv-pop i:empty{display:none}';
  let icon = null, iconKey = '';
  // k: the counts, when another TV gives them (a TV in a watch party shows the first TV's); else this TV's own room.
  function popIcon(z, k0) {
    const host = typeof VP !== 'undefined' && VP && VP.root;
    if (!z || !host || !host.appendChild) { if (icon) icon.classList.remove('vtv-pop-on'); iconKey = ''; return; }
    if (!icon || icon.parentNode !== host) {
      if (!document.getElementById('vtv-pop-css')) { const st = document.createElement('style'); st.id = 'vtv-pop-css'; st.textContent = ICON_CSS; document.head.appendChild(st); }
      if (icon && icon.parentNode) icon.parentNode.removeChild(icon);
      icon = document.createElement('div'); icon.className = 'vtv-pop'; icon.setAttribute('role', 'status');
      icon.innerHTML = ICON + '<i></i>';
      icon.onclick = () => (root.PartyGuest && root.PartyGuest.on ? root.PartyGuest.chooser(adapter) : root.RemoteScreen.show());
      host.appendChild(icon);
    }
    const k = k0 || root.RemoteScreen.quizCount(z);
    const words = !k ? '' : z.phase === 'q' ? k.answered + ' of ' + k.phones + ' answered' : k.right + ' of ' + k.phones + ' got it';
    const key = z.n + words;
    if (key !== iconKey) { iconKey = key; icon.querySelector('i').textContent = words; icon.setAttribute('aria-label', 'Trivia on your phone. ' + words); }
    icon.classList.add('vtv-pop-on');
  }

  // ---- The watch party (remote/src/party.js; Bryan, 20 Nov 2026: "then the party that initiated gets their live tv to be the
  // dominant and then when the others go they are on that one") ----
  // The first TV tells the party its channel. A TV that joins takes the first TV's time zone for Live TV (TVG.setOff: the
  // schedule is the clock in a zone, so the same zone is the same moment of the same airing), plays its channel and follows
  // each change. The schedule is laid out again for the new zone (TV and TVLIB start over; the page loads them anew).
  const LOCAL = (ms) => -new Date(ms).getTimezoneOffset() * 60000;
  const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
  // before: this TV's own channel when it joined, kept for the tab so a reload during the party still goes back to it.
  const BEFORE = 'voidtv-party-before';
  let partyZone = '', before = (() => { try { return JSON.parse(sessionStorage.getItem(BEFORE) || 'null'); } catch (e) { return null; } })();
  adapter.party = () => ({ chan: state.chan || '', on: onTv() });
  // The remote's panel goes inside the picture on Live TV (night audit N14: never over CH, Open show or the remote's own button).
  adapter.panelHost = () => (onTv() && typeof VP !== 'undefined' && VP && VP.root && document.body.contains(VP.root) ? VP.root : null);
  // On a TV in a party: the first TV's pop-up, shown here as the same small icon, with the first TV's counts.
  adapter.popShow = (q) => popIcon(q && q.pop && onTv() ? { n: q.n, phase: q.phase } : null, q ? { phones: q.phones, answered: q.answered, right: q.right } : null);
  adapter.partyApply = (m) => {
    if (!before) { before = { chan: state.chan }; try { sessionStorage.setItem(BEFORE, JSON.stringify(before)); } catch (e) { /* this page only */ } }
    let moved = false;
    if (V.zoneOk(m.zone) && m.zone !== (partyZone || localZone())) {
      const f = V.tzOff(m.zone);
      if (f) { TVG.setOff(f); partyZone = m.zone; TV = null; TVLIB = null; moved = true; }
    }
    if (!m.on || !m.chan) return;   // the first TV is not on Live TV: this one stays where it is until it is
    const v = viewNow();
    if (moved || state.chan !== m.chan || v !== 'tv') {
      root.PartyGuest.follow(() => { state.tvOn = true; if (!moved && v === 'tv' && TV) tune(m.chan); else go('tv/' + m.chan, true); });
    }
  };
  adapter.partyLeave = () => {
    const b = before; before = null; try { sessionStorage.removeItem(BEFORE); } catch (e) { /* fine */ }
    if (partyZone) { TVG.setOff(LOCAL); partyZone = ''; TV = null; TVLIB = null; }
    const v = viewNow();
    if (v === 'tv' || v === 'home') { state.tvOn = true; go(b && b.chan ? 'tv/' + b.chan : 'tv', true); }
  };
  root.SiteRemote = adapter;   // the name every site's adapter takes; the page passes it to RemoteScreen.start
})(typeof self !== 'undefined' ? self : this);
