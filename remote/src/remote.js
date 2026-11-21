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
  const ACTIONS = { ch: 'dir', tune: 'id', now: '', go: 'slug', info: 'slug', tv: '' };
  const SAVED_MAX = 100;

  // A string as a phone or a screen may show it: plain text, no control characters, at most n characters.
  function clip(s, n) {
    const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
  }
  const idOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,79}$/i.test(s);
  const size = (msg) => JSON.stringify(msg).length + ENVELOPE;
  const fits = (msg) => size(msg) <= MAX;

  // What the phone sent, made safe: { a, dir | id | slug } or null.
  function readDo(m) {
    if (!m || m.type !== 'r-do' || !Object.prototype.hasOwnProperty.call(ACTIONS, m.a)) return null;
    const need = ACTIONS[m.a];
    if (need === 'dir') return m.dir === 1 || m.dir === -1 ? { a: m.a, dir: m.dir } : null;
    if (need === 'id' || need === 'slug') return idOk(m[need]) ? { a: m.a, [need]: m[need] } : null;
    return { a: m.a };
  }

  // Who the screen is. donate is the site's own CASH link, or '' where none is shown (Kids: only behind its grown-up check).
  function siteMsg(o) {
    return { type: 'r-site', name: clip(o.name, 40), home: clip(o.home, 120), donate: o.donate ? clip(o.donate, 200) : '', kids: !!o.kids };
  }

  // What is on now. k: what the screen is showing (tv, show, page). acts: the buttons that make sense now, each { a, l }:
  // a is an action from ACTIONS, l the words on it. left: seconds to go, counted down on the phone from when it arrives.
  function nowMsg(o) {
    const m = { type: 'r-now', k: clip(o.k || 'page', 10), brk: !!o.brk, where: clip(o.where, 50), t: clip(o.t, 80), s: clip(o.s, 90),
      nx: clip(o.nx, 90), left: Number.isFinite(o.left) && o.left > 0 ? Math.round(o.left) : null,
      slug: idOk(o.slug) ? o.slug : '', art: /^https:\/\/[^"'<>\s]{1,200}$/.test(o.art || '') ? o.art : '',
      acts: (o.acts || []).filter((x) => x && Object.prototype.hasOwnProperty.call(ACTIONS, x.a)).slice(0, 6).map((x) => ({ a: x.a, l: clip(x.l, 24) })) };
    while (!fits(m) && m.art) m.art = '';
    while (!fits(m) && m.s.length > 10) m.s = clip(m.s, m.s.length - 10);
    return m;
  }

  // A long list (every channel and what is on it) cut into messages that each fit. items: [{ id, t, s }]; on: the id that is
  // playing now. The phone puts the parts together by part and of, and draws the list once every part of this ver is in.
  function listMsgs(id, title, items, on, ver) {
    const rows = items.filter((x) => x && idOk(x.id)).map((x) => ({ id: x.id, t: clip(x.t, 40), s: clip(x.s, 50) }));
    const out = [];
    let cur = [];
    const head = (part) => ({ type: 'r-list', id, title: clip(title, 40), on: idOk(on) ? on : '', ver: ver | 0, part, of: 0, items: [] });
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
    return { id: m.id, title: m.title, on: m.on, items: [].concat(...s.parts) };
  }

  // A show's details for the phone, from one shown on the screen.
  function infoMsg(o) {
    const m = { type: 'r-info', slug: idOk(o.slug) ? o.slug : '', t: clip(o.t, 80), sub: clip(o.sub, 90), ppl: clip(o.ppl, 120),
      about: clip(o.about, 420), url: /^https?:\/\/[^"'<>\s]{1,200}$/.test(o.url || '') ? o.url : '' };
    while (!fits(m) && m.about.length > 40) m.about = clip(m.about, m.about.length - 40);
    return m;
  }

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

  // "8:30 pm", "18 min left" and "1:05 left": the times as the phone shows them.
  const leftWords = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + ' h ' + String(m).padStart(2, '0') + ' min left' : m ? m + ' min left' : 'under a minute left'; };

  const api = { MAX, ACTIONS, SAVED_MAX, clip, readDo, siteMsg, nowMsg, listMsgs, listTake, infoMsg, savedAdd, savedDrop, savedHas, savedRead, size, fits, leftWords, LETTERS, quizAsk, quizAnswer, quizResults, quizCount, POP, popAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoidRemote = api;
})(typeof self !== 'undefined' ? self : this);
