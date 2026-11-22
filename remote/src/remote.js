// VoidTV phone remote: the parts both sides share, pure and tested (tests/remote.test.js). Licence: GPL-2.0-or-later.
// Bryan, 20 Nov 2026: "using the qr code phone dynamic in creating a remote control to use across void tv in a custom way where
// things are on the phone where ppl can select, a channel switcher, save to phone, info on the phone about the show, hold
// information", and "also use this for cast, and kids, across the entire voidtv universe".
//
// So the phone page knows no site: it draws what the screen sends. A screen (voidtv.net, later Kids, Void Cast) says who it is
// (r-site), what is on now with the actions that make sense there (r-now), lists to pick from (r-list), and a show's details
// when asked (r-info). The phone sends back one kind of thing, r-do, an action by name. Each site writes a small adapter that
// answers those (remote/src/voidtv.js for voidtv.net). Trivia rides in the same room with its own t- messages.
// Every message fits the relay's 1 KB (play/rooms/room.js), envelope included.
(function (root) {
  'use strict';
  const MAX = 1024;
  const ENVELOPE = 40;   // {"to":"all","msg":...} or {"from":16,"msg":...} around the message
  // Actions a phone may ask for, and what each carries. Anything else is dropped unread.
  // Bryan, 22 Nov 2026: "the phone remote needs to have pause on it and also work for searching and interacting with the direct
  // play areas of vtv". pause and play hold and go on with the picture; live takes a Live TV picture that was paused back to where
  // the channel is now (he picked L1 from the pictures: pause, then catch up). find searches the site the screen is on (q: words);
  // watch plays a show from where this home left off; area takes the screen to one of the areas in the shared menu; game starts a
  // PLAY game; press presses one of the page's own buttons, from the adapter's own list; hand asks the screen for the area's own
  // phone page (PLAY's game pad, Trivia's answer page) and the screen answers with r-hand, a room code.
  const ACTIONS = { ch: 'dir', tune: 'id', now: '', go: 'slug', info: 'slug', tv: '', pause: '', play: '', live: '', find: 'q', watch: 'slug',
    area: 'id', game: 'id', press: 'id', hand: '' };
  const SAVED_MAX = 100;

  // A string as a phone or a screen may show it: plain text, no control characters, at most n characters.
  function clip(s, n) {
    const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
  }
  // An id or a slug: a channel, a show, an area, a PLAY game (the longest PLAY game id is 95 characters).
  const idOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,119}$/i.test(s);
  // Search words as a phone typed them: plain text, 1 to 60 characters (the site's own search does the rest).
  const qOk = (s) => typeof s === 'string' && s.length <= 200 && clip(s, 61).length >= 1;
  const size = (msg) => JSON.stringify(msg).length + ENVELOPE;
  const fits = (msg) => size(msg) <= MAX;

  // What the phone sent, made safe: { a, dir | id | slug } or null.
  function readDo(m) {
    if (!m || m.type !== 'r-do' || !Object.prototype.hasOwnProperty.call(ACTIONS, m.a)) return null;
    const need = ACTIONS[m.a];
    if (need === 'dir') return m.dir === 1 || m.dir === -1 ? { a: m.a, dir: m.dir } : null;
    if (need === 'id' || need === 'slug') return idOk(m[need]) ? { a: m.a, [need]: m[need] } : null;
    if (need === 'q') return qOk(m.q) ? { a: m.a, q: clip(m.q, 60) } : null;
    return { a: m.a };
  }
  // A button the screen offers: an action from ACTIONS and its words; an action that carries an id or a slug carries it here too
  // (Back to the games is area play), checked as a phone's own would be. CH is drawn as the big buttons, so it carries no dir.
  function actOk(x) {
    if (!x || !Object.prototype.hasOwnProperty.call(ACTIONS, x.a)) return null;
    const need = ACTIONS[x.a];
    if (need === 'q') return null;
    const b = { a: x.a, l: clip(x.l, 24) };
    // About carries no slug: the phone asks about what is on now. One that carries one must carry a good one.
    if ((need === 'id' || need === 'slug') && x[need] !== undefined) { if (!idOk(x[need])) return null; b[need] = x[need]; }
    return b;
  }

  // Who the screen is. donate is the site's own CASH link, or '' where none is shown (Kids: only behind its grown-up check).
  // find: the words in the phone's search box ("Search shows and movies", "Search games"), '' where the screen has no search.
  function siteMsg(o) {
    return { type: 'r-site', name: clip(o.name, 40), home: clip(o.home, 120), donate: o.donate ? clip(o.donate, 200) : '', kids: !!o.kids, find: clip(o.find, 40) };
  }

  // What is on now. k: what the screen is showing (tv, show, page). acts: the buttons that make sense now, each { a, l }:
  // a is an action from ACTIONS, l the words on it. left: seconds to go, counted down on the phone from when it arrives.
  function nowMsg(o) {
    const m = { type: 'r-now', k: clip(o.k || 'page', 10), brk: !!o.brk, where: clip(o.where, 50), t: clip(o.t, 80), s: clip(o.s, 90),
      nx: clip(o.nx, 90), left: Number.isFinite(o.left) && o.left > 0 ? Math.round(o.left) : null,
      slug: idOk(o.slug) ? o.slug : '', art: /^https:\/\/[^"'<>\s]{1,200}$/.test(o.art || '') ? o.art : '',
      acts: (o.acts || []).map(actOk).filter(Boolean).slice(0, 6) };
    while (!fits(m) && m.art) m.art = '';
    while (!fits(m) && m.s.length > 10) m.s = clip(m.s, m.s.length - 10);
    return m;
  }

  // A long list (every channel and what is on it) cut into messages that each fit. items: [{ id, t, s }]; on: the id that is
  // playing now. The phone puts the parts together by part and of, and draws the list once every part of this ver is in.
  // a: what a tap on a row asks for (tune a channel, go to a show, start a game, open an area); tune when not said.
  const tapOf = (a) => (Object.prototype.hasOwnProperty.call(ACTIONS, a) && /^(id|slug)$/.test(ACTIONS[a]) ? a : 'tune');
  function listMsgs(id, title, items, on, ver, a) {
    const rows = items.filter((x) => x && idOk(x.id)).map((x) => ({ id: x.id, t: clip(x.t, 40), s: clip(x.s, 50) }));
    const out = [];
    let cur = [];
    const head = (part) => ({ type: 'r-list', id, a: tapOf(a), title: clip(title, 40), on: idOk(on) ? on : '', ver: ver | 0, part, of: 0, items: [] });
    for (const r of rows) {
      const m = head(out.length); m.items = cur.concat([r]);
      if (cur.length && !fits(Object.assign(m, { of: 999 }))) { out.push(cur); cur = [r]; } else cur.push(r);
    }
    if (cur.length || !out.length) out.push(cur);
    return out.map((items2, i) => Object.assign(head(i), { of: out.length, items: items2 }));
  }
  // The phone's side: a part arrived. Returns the whole list when this ver is complete, else null.
  function listTake(store, m) {
    if (!m || m.type !== 'r-list' || !Number.isInteger(m.part) || !Number.isInteger(m.of) || m.of < 1 || m.of > 200) return null;
    let s = store[m.id];
    if (!s || s.ver !== m.ver) s = store[m.id] = { ver: m.ver, of: m.of, parts: [] };
    s.parts[m.part] = m.items || [];
    for (let i = 0; i < s.of; i++) if (!s.parts[i]) return null;
    return { id: m.id, a: tapOf(m.a), title: m.title, on: m.on, items: [].concat(...s.parts) };
  }
  // A row tapped on the phone: the r-do it sends (the row's id goes as the id or the slug its action takes).
  const rowDo = (l, it) => ({ type: 'r-do', a: tapOf(l.a), [ACTIONS[tapOf(l.a)]]: it.id });

  // THE HAND-OVER (Bryan picked P1 from the pictures, 22 Nov 2026: pick a game on the phone, then the phone is its pad). An area
  // with its own phone page (PLAY's game pad, Trivia's answer page) has its own room; the screen tells one phone that room's code
  // and the phone goes to the join page with it, which asks the relay what kind of room it is and opens voidtv.net's own page
  // for that kind (play/join.html). So the phone still takes no link from a message (night audit N10): only four letters, the
  // same a person types at voidtv.net/join. what: the words the phone shows while it goes.
  const CODE = /^[2-9A-Z]{4}$/;
  const handMsg = (code, what) => (CODE.test(code || '') ? { type: 'r-hand', code, what: clip(what, 60) } : null);
  const handPath = (m) => (m && m.type === 'r-hand' && CODE.test(m.code || '') ? '/join?r=' + m.code : '');
  // The screen is going where the remote cannot follow (an area on its own address: University, Kids, Hindi): the phone says so.
  const awayMsg = (name) => ({ type: 'r-away', name: clip(name, 40) });

  // PAUSE ON LIVE TV (Bryan picked L1, 22 Nov 2026). Live TV is the clock's: pausing holds this TV's picture only, and Play goes on
  // from there, behind the channel; the next show still starts at its time. How far behind, in seconds, from where the clock says
  // the airing is (at) and where this picture is (pos); null when it cannot be told. More than BEHIND_S offers Back to live.
  const BEHIND_S = 20;
  const behind = (at, pos) => (Number.isFinite(at) && Number.isFinite(pos) ? Math.max(0, Math.round(at - pos)) : null);
  // "4 min behind live", "under a minute behind live": in minutes, so the words change once a minute, not with every poll.
  const behindWords = (sec) => (sec >= 60 ? Math.round(sec / 60) + ' min behind live' : 'under a minute behind live');

  // SEARCH: the shows a search found, best first. hits: the site's own search's answer, in its own order (scripts/lib/app.js,
  // qHit). Names that start with the words come first, then names with a word that starts with them, then names that have them
  // inside a word, then the rest (a person, a network, a genre); between equals the site's own order. At most n.
  function rankFind(hits, q, n) {
    const w = String(q || '').trim().toLowerCase();
    // A word of the name that starts with them ("Ms. Pac-Man" for "pac") before one that only has them inside ("Space Panic").
    const wordAt = (t, j) => j === 0 || !/[a-z0-9]/.test(t[j - 1]);
    const tier = (s) => {
      const t = String(s.show || s.title || '').toLowerCase();
      let i = t.indexOf(w);
      if (i < 0) return 3;
      if (i === 0) return 0;
      for (; i >= 0; i = t.indexOf(w, i + 1)) if (wordAt(t, i)) return 1;
      return 2;
    };
    return hits.map((s, i) => ({ s, i, k: tier(s) })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, n || 40).map((x) => x.s);
  }

  // A show's details for the phone, from one shown on the screen.
  function infoMsg(o) {
    const m = { type: 'r-info', slug: idOk(o.slug) ? o.slug : '', t: clip(o.t, 80), sub: clip(o.sub, 90), ppl: clip(o.ppl, 120),
      about: clip(o.about, 420), url: /^https?:\/\/[^"'<>\s]{1,200}$/.test(o.url || '') ? o.url : '' };
    while (!fits(m) && m.about.length > 40) m.about = clip(m.about, m.about.length - 40);
    return m;
  }

  // A show's page on this same site, from its slug alone (night audit N10, 21 Nov 2026). The phone never opens an address a
  // screen sent: nothing proves a room's screen is a voidtv.net page (a script can open a room), so a link from a message
  // could lead anywhere, or run code on voidtv.net. '' when the slug is not a slug.
  const showPath = (slug) => (idOk(slug) && !/[:/]/.test(slug) ? '/show/' + slug : '');

  // Saved on the phone (its own storage, nothing sent anywhere): newest first, one entry a show, at most SAVED_MAX.
  function savedAdd(list, it, now) {
    if (!it || !idOk(it.slug)) return list || [];
    const rest = (list || []).filter((x) => x && x.slug !== it.slug);
    return [{ slug: it.slug, t: clip(it.t, 80), s: clip(it.s, 90), url: it.url || '', at: now || 0 }].concat(rest).slice(0, SAVED_MAX);
  }
  const savedDrop = (list, slug) => (list || []).filter((x) => x && x.slug !== slug);
  const savedHas = (list, slug) => (list || []).some((x) => x && x.slug === slug);
  // What a phone's storage held, made safe (it may be from an older page, or edited by hand).
  function savedRead(text) {
    let a; try { a = JSON.parse(text || '[]'); } catch (e) { return []; }
    if (!Array.isArray(a)) return [];
    return a.filter((x) => x && idOk(x.slug)).slice(0, SAVED_MAX).map((x) => ({ slug: x.slug, t: clip(x.t, 80), s: clip(x.s, 90),
      url: /^https?:\/\/[^"'<>\s]{1,200}$/.test(x.url || '') ? x.url : '', at: Number(x.at) || 0 }));
  }

  // TRIVIA IN THE BREAKS (Bryan, 20 Nov 2026: "Trivia in breaks"). The Live TV page shows one question about the show that just
  // played (trivia/src/live.js picks it; the same one for everyone on the channel); phones in the room answer it. The messages
  // are Trivia Night's own (t-q, t-a, t-got, t-res, trivia/src/phone.js), so both games speak alike. A quiz, as a site's adapter
  // gives it: { n, show, q, choices, answer, phase: 'q' | 'a', endsAt (when answers close, ms), msTotal, src }.
  const LETTERS = ['A', 'B', 'C', 'D'];
  function quizAsk(z, now) {
    const m = { type: 't-q', n: z.n, of: 0, live: true, pop: !!z.pop, kick: clip('Trivia: ' + z.show, 60), q: clip(z.q, 300),
      choices: z.choices.slice(0, 4).map((c) => clip(c, 80)), secs: Math.max(0, Math.round((z.endsAt - now) / 1000)), pick: null };
    while (!fits(m) && m.q.length > 40) m.q = clip(m.q, m.q.length - 40);
    return m;
  }
  // A phone's answer: the question now open, a choice it has, its first answer only, before answers close. Gives the t-got.
  function quizAnswer(book, seat, m, z, now) {
    if (!z || z.phase !== 'q' || !m || m.type !== 't-a' || m.n !== z.n || now > z.endsAt) return null;
    if (!Number.isInteger(m.pick) || m.pick < 0 || m.pick >= z.choices.length) return null;
    const p = book[seat] || (book[seat] = { score: 0 });
    if (p.n === z.n) return null;
    p.n = z.n; p.pick = m.pick; p.at = now;
    return { type: 't-got', n: z.n, pick: m.pick };
  }
  // The answer is out: each phone's result, with its points (points(right, msLeft, msTotal), Trivia's scoring) and its place
  // among the phones in the room. Called once a question.
  function quizResults(book, seats, z, points) {
    const pts = points || ((right) => (right ? 1000 : 0));
    const got = new Map();
    for (const seat of seats) {
      const p = book[seat] || (book[seat] = { score: 0 });
      const pick = p.n === z.n ? p.pick : null, right = pick === z.answer;
      const add = pick === null ? 0 : pts(right, z.endsAt - p.at, z.msTotal);
      p.score += add; got.set(seat, { pick, right, add });
    }
    const list = seats.map((seat) => ({ seat, score: book[seat].score })).sort((a, b) => (b.score - a.score) || (a.seat - b.seat));
    let place = 0, last = null;
    const src = z.src && z.src.site ? clip(z.src.site, 40) : '';
    return list.map((r, i) => {
      if (r.score !== last) { place = i + 1; last = r.score; }
      const g = got.get(r.seat);
      return [r.seat, { type: 't-res', n: z.n, live: true, pick: g.pick, answer: z.answer, a: clip(LETTERS[z.answer] + ': ' + z.choices[z.answer], 90),
        right: g.right, points: g.add, score: r.score, place, of: list.length, src }];
    });
  }
  // For the TV card: how many phones answered this question, and how many got it right once it is out.
  function quizCount(book, seats, z) {
    let answered = 0, right = 0;
    for (const seat of seats) { const p = book[seat]; if (p && p.n === z.n) { answered++; if (p.pick === z.answer) right++; } }
    return { phones: seats.length, answered, right };
  }

  // POP-UPS DURING THE SHOW (Bryan, 20 Nov 2026: "a small vtv icon we make for trivia to pop up and then on the phone/ device
  // connected from the ppl the info pops up to not obscure"). The big screen shows only a small icon in a corner; the question
  // is on the phones. When one opens comes from the clock alone, so everyone on a channel gets it at the same moment: the first
  // 3 minutes into an episode, then every 5, each open 40 seconds, the result shown 15 more, none in the last minute.
  const POP = { firstMs: 3 * 60e3, everyMs: 5 * 60e3, openMs: 40e3, resultMs: 15e3, tailMs: 60e3 };
  // The pop-up at instant t in an episode from st to en: { i, start, close, until } (answers until close, the result until until), or null.
  function popAt(st, en, t, P) {
    const p = P || POP;
    if (!(t >= st + p.firstMs) || t >= en) return null;
    const i = Math.floor((t - st - p.firstMs) / p.everyMs), start = st + p.firstMs + i * p.everyMs;
    const close = start + p.openMs, until = close + p.resultMs;
    if (t >= until || until > en - p.tailMs) return null;
    return { i, start, close, until };
  }

  // THE WATCH PARTY (Bryan, 20 Nov 2026: "my parents live in central tz and i eastern ... then the party that initiated gets
  // their live tv to be the dominant and then when the others go they are on that one"). Live TV is one schedule worked out
  // from the clock in a time zone (scripts/lib/tvgrid.js, TVG.setOff), so a TV that joins a party only needs the host's
  // zone: then both are at the same moment of the same airing with nothing else to keep in step.
  const zoneOk = (z) => { if (typeof z !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(z)) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };
  // A zone's offset from UTC at an instant, in ms (what TVG.setOff takes), from the browser's own zone rules. Kept per quarter
  // hour, since the schedule asks it often and a zone changes its offset only on the hour or the half hour.
  function tzOff(zone) {
    if (!zoneOk(zone)) return null;
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const kept = new Map();
    return (ms) => {
      const k = Math.floor(ms / 900000);
      let off = kept.get(k);
      if (off === undefined) {
        const p = {}; for (const x of f.formatToParts(k * 900000)) p[x.type] = x.value;
        off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - k * 900000;
        if (kept.size > 2000) kept.clear();
        kept.set(k, off);
      }
      return off;
    };
  }
  // "America/Chicago" -> "Chicago": how a home is named on the score list (no names of people, only where the TV is).
  const zoneCity = (z) => (zoneOk(z) ? z.split('/').pop().replace(/_/g, ' ') : '');
  // One score list for the party: every phone, best first, each with its place and its home's city.
  function partyScores(book, phoneSeats, homeOf) {
    const list = phoneSeats.map((seat) => ({ seat, score: (book[seat] && book[seat].score) || 0, home: clip(homeOf(seat) || '', 30) }))
      .sort((a, b) => (b.score - a.score) || (a.seat - b.seat));
    let place = 0, last = null;
    return list.map((r, i) => { if (r.score !== last) { place = i + 1; last = r.score; } return Object.assign(r, { place }); }).slice(0, 16);
  }
  // The score list in a line, for a TV card: "1st Phone 2 (Chicago) 1,400 · 2nd Phone 1 (New York) 700".
  const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const scoreLine = (list, max) => (list || []).slice(0, max || 4).map((r) => ORD(r.place) + ' Phone ' + r.seat + (r.home ? ' (' + r.home + ')' : '') + ' ' + r.score.toLocaleString('en-US')).join(' · ');

  // "8:30 pm", "18 min left" and "1:05 left": the times as the phone shows them.
  const leftWords = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + ' h ' + String(m).padStart(2, '0') + ' min left' : m ? m + ' min left' : 'under a minute left'; };

  const api = { MAX, ACTIONS, SAVED_MAX, clip, idOk, readDo, actOk, rowDo, handMsg, handPath, awayMsg, BEHIND_S, behind, behindWords, rankFind, siteMsg, nowMsg, listMsgs, listTake, infoMsg, savedAdd, savedDrop, savedHas, savedRead, size, fits, leftWords, LETTERS, quizAsk, quizAnswer, quizResults, quizCount, POP, popAt, zoneOk, tzOff, zoneCity, partyScores, scoreLine, showPath };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidRemote = api;
})(typeof self !== 'undefined' ? self : this);
