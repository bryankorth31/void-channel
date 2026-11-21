// PLAY AND LEARN page (PLAN-kids-play P3, P6). Browser only: build.js puts PLAY (core.js), PACKS, WORDS, ART and VOICE
// (the clip keys that exist) in the page before this file. It draws; the rules live in core.js.
// Mission rules kept here: no points, coins, prizes, streaks or timers; a wrong tap says what it was and asks again;
// a child sets the pace (a Next button, never a countdown); after a few sets the page rests; nothing is stored or sent.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rand = PLAY.rng(Date.now() & 0xffffffff);
  const QUIET = /quiet/.test(location.hash); // tests and grown-ups checking it: no sound at all
  const main = $('#pl');
  let setsDone = 0, token = 0; // token: each new screen cancels the old one's waiting steps

  // ---- voice: one line after another; a line with no clip is skipped (its words are on screen anyway)
  const aud = new Audio(); let queue = [], after = null;
  function say(lines, then) { aud.pause(); queue = [].concat(lines).filter(Boolean); after = then || null; next(); }
  function next() {
    if (!queue.length) { const f = after; after = null; if (f) setTimeout(f, 250); return; }
    const t = queue.shift(), k = PLAY.voiceKey(t);
    if (QUIET || !VOICE[k]) { setTimeout(next, 60); return; }
    aud.src = VBASE + k + '.mp3'; aud.onended = next; aud.onerror = next; aud.play().catch(next);
  }
  function hush() { queue = []; after = null; aud.pause(); }
  window.playHush = hush;

  // ---- pictures
  const svg = (id) => ART[id] ? '<svg viewBox="0 0 100 100" aria-hidden="true">' + ART[id] + '</svg>' : '';
  function dots(n) { let h = ''; const cols = n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols), sp = 80 / Math.max(cols, rows); for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); h += '<circle cx="' + (50 + (c - (cols - 1) / 2) * sp) + '" cy="' + (50 + (r - (rows - 1) / 2) * sp) + '" r="' + Math.min(11, sp / 2.6) + '" fill="#ff5fa2" stroke="#1b1f3b" stroke-width="4"/>'; } return '<svg viewBox="0 0 100 100" aria-hidden="true">' + h + '</svg>'; }
  function look(x) { return x.art ? svg(x.art) : x.dots ? dots(x.dots) : '<span class="gl">' + esc(x.text) + '</span>'; }
  const item = (pack, id) => pack.items.find((x) => x.id === id);

  function screen(html, cls) { token++; hush(); main.className = cls || ''; main.innerHTML = html; window.scrollTo(0, 0); return token; }
  const live = (t) => t === token;
  // The top bar's arrow is the back button (scripts/lib/kids-nav.js): in a game it goes back to the games.
  window.kidsBackHere = () => { if (main.className === 'pl-home') return false; home(); return true; };
  const back = ''; const oldBack = '<button class="pl-back" data-go="home" aria-label="Back to the games">' + '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M60 20L30 50L60 80" fill="none" stroke="#1b1f3b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  const ear = '<button class="pl-ear" data-say="1" aria-label="Say it again">' + svg('g_listen') + '</button>';
  main.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { if (b.dataset.go === 'home') home(); } });

  // ---- home: the four games
  const GAMES = ['listen', 'match', 'sort', 'trace'];
  function home() {
    if (PLAY.shouldRest(setsDone)) return rest();
    screen('<h1 class="pl-h">Play and Learn</h1><p class="pl-sub">Pick a game</p><div class="pl-games">' + GAMES.map((g) => '<button class="pl-game" data-game="' + g + '">' + svg('g_' + g) + '<b>' + esc(WORDS.games[g].name) + '</b></button>').join('') + '</div>', 'pl-home');
    main.querySelectorAll('[data-game]').forEach((b) => b.onclick = () => topics(b.dataset.game));
  }
  // ---- pick what to play with
  function topics(game) {
    const packs = PLAY.packsFor(PACKS, game);
    const t = screen(back + '<h1 class="pl-h">' + esc(WORDS.games[game].name) + '</h1><div class="pl-topics">' + packs.map((p) => '<button class="pl-topic" data-pack="' + p.id + '">' + look(p.tile) + '<b>' + esc(p.name) + '</b></button>').join('') + '</div>');
    say(WORDS.games[game].say);
    main.querySelectorAll('[data-pack]').forEach((b) => b.onclick = () => { if (live(t)) start(game, PACKS.find((p) => p.id === b.dataset.pack)); });
  }
  function start(game, pack) { ({ listen, match, sort, trace })[game](pack); }
  const steps = (n, at) => '<div class="pl-steps" aria-hidden="true">' + Array.from({ length: n }, (_, i) => '<i class="' + (i < at ? 'd' : i === at ? 'c' : '') + '"></i>').join('') + '</div>';
  const nextBtn = '<button class="pl-next" aria-label="Next">' + '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M38 20L68 50L38 80" fill="none" stroke="#1b1f3b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

  // ---- Listen and tap
  function listen(pack) {
    const rounds = PLAY.listenSet(pack, PLAY.SET_SIZE.listen, rand), found = [];
    (function round(r) {
      if (r >= rounds.length) return setDone('listen', pack, found);
      const R = rounds[r], ans = item(pack, R.answer); let misses = 0;
      const t = screen(back + steps(rounds.length, r) + '<div class="pl-ask">' + ear + '<p>' + esc(ans.ask) + '</p></div><div class="pl-picks wait">' + R.choices.map((id) => '<button class="pl-pick" data-id="' + id + '" aria-label="' + esc(item(pack, id).name) + '">' + look(item(pack, id).show) + '</button>').join('') + '</div><div class="pl-say" role="status"></div>', 'pl-game-listen');
      const picks = main.querySelector('.pl-picks'), note = main.querySelector('.pl-say');
      const ask = () => say(ans.ask, () => { if (live(t)) setTimeout(() => live(t) && picks.classList.remove('wait'), 500); }); // a short pause to think
      ask(); main.querySelector('.pl-ear').onclick = () => say(ans.ask);
      picks.querySelectorAll('.pl-pick').forEach((b) => b.onclick = () => {
        if (picks.classList.contains('wait') || picks.classList.contains('over')) return;
        const it = item(pack, b.dataset.id);
        if (it.id === ans.id) { picks.classList.add('over'); b.classList.add('ok'); note.textContent = ans.yes; found.push(ans.id); say(ans.yes, () => { if (!live(t)) return; note.insertAdjacentHTML('afterend', nextBtn); main.querySelector('.pl-next').onclick = () => round(r + 1); }); }
        else { b.classList.add('tried'); misses++; if (misses >= 2) picks.querySelector('[data-id="' + ans.id + '"]').classList.add('hint'); note.textContent = it.name + ' ' + WORDS.lookAgain; say([it.name, WORDS.lookAgain, ans.ask]); }
      });
    })(0);
  }

  // ---- Match pairs
  function match(pack) {
    const cards = PLAY.board(pack, pack.pairs || 3, rand), up = [], found = [];
    const t = screen(back + '<div class="pl-ask">' + ear + '<p>' + esc(WORDS.matchStart) + '</p></div><div class="pl-board n' + cards.length + '">' + cards.map((c, i) => '<button class="pl-card" data-i="' + i + '" aria-label="Card ' + (i + 1) + '"><span class="f">' + look(c.face === 'show' ? item(pack, c.item).show : item(pack, c.item).pair) + '</span></button>').join('') + '</div><div class="pl-say" role="status"></div>', 'pl-game-match');
    say(WORDS.matchStart); main.querySelector('.pl-ear').onclick = () => say(WORDS.matchStart);
    const note = main.querySelector('.pl-say'); let busy = false;
    main.querySelectorAll('.pl-card').forEach((b) => b.onclick = () => {
      const c = cards[+b.dataset.i];
      if (busy || b.classList.contains('up')) return;
      b.classList.add('up'); up.push([c, b]);
      if (up.length < 2) { say(item(pack, c.item).name); return; }
      const [[c1, b1], [c2, b2]] = up.splice(0);
      if (PLAY.isMatch(c1, c2)) {
        b1.classList.add('ok'); b2.classList.add('ok'); found.push(c1.item); const it = item(pack, c1.item); note.textContent = it.yes;
        say([WORDS.matchYes, it.name], () => { if (live(t) && found.length * 2 === cards.length) { note.insertAdjacentHTML('afterend', nextBtn); main.querySelector('.pl-next').onclick = () => setDone('match', pack, found); } });
      } else { busy = true; say(item(pack, c2.item).name, () => setTimeout(() => { if (!live(t)) return; b1.classList.remove('up'); b2.classList.remove('up'); busy = false; }, 700)); }
    });
  }

  // ---- Sort it (tap a bin, or drag the picture into one)
  function sort(pack) {
    const S = PLAY.sortSet(pack, PLAY.SET_SIZE.sort, rand), so = pack.sorts[S.sort], placed = [];
    const t = screen(back + steps(S.queue.length, 0) + '<div class="pl-ask">' + ear + '<p>' + esc(so.ask) + '</p></div><div class="pl-thing" role="img"></div><div class="pl-bins">' + so.bins.map((b, i) => '<button class="pl-bin b' + i + '" data-b="' + i + '"><span class="ic">' + (b.art ? svg(b.art) : dots(b.dots)) + '</span><b>' + esc(b.label) + '</b><span class="in"></span></button>').join('') + '</div><div class="pl-say" role="status"></div>', 'pl-game-sort');
    const thing = main.querySelector('.pl-thing'), note = main.querySelector('.pl-say');
    let k = 0, wait = true;
    const ask = () => { const it = item(pack, S.queue[k].item); wait = true; say([it.name, so.ask], () => { if (live(t)) wait = false; }); };
    function show() { const it = item(pack, S.queue[k].item); thing.innerHTML = '<span class="pl-drag">' + look(it.show) + '</span>'; thing.setAttribute('aria-label', it.name); main.querySelector('.pl-steps').outerHTML = steps(S.queue.length, k); note.textContent = ''; ask(); wire(thing.firstChild); }
    function answer(bi) {
      if (wait) return;
      const q = S.queue[k], it = item(pack, q.item);
      if (bi === q.bin) { wait = true; placed.push(q.item); main.querySelector('.pl-bin.b' + bi + ' .in').insertAdjacentHTML('beforeend', '<i>' + look(it.show) + '</i>'); thing.innerHTML = ''; note.textContent = so.bins[bi].yes;
        say(so.bins[bi].yes, () => { if (!live(t)) return; k++; if (k < S.queue.length) setTimeout(() => live(t) && show(), 400); else { note.insertAdjacentHTML('afterend', nextBtn); main.querySelector('.pl-next').onclick = () => setDone('sort', pack, placed); } }); }
      else { note.textContent = WORDS.thinkAgain; say([WORDS.thinkAgain, so.ask]); }
    }
    main.querySelectorAll('.pl-bin').forEach((b) => b.onclick = () => answer(+b.dataset.b));
    main.querySelector('.pl-ear').onclick = () => ask();
    function wire(el) { // drag: the picture follows the finger; let go over a bin to answer
      if (!el) return; let sx = 0, sy = 0, on = false;
      el.onpointerdown = (e) => { if (wait) return; on = true; sx = e.clientX; sy = e.clientY; el.setPointerCapture(e.pointerId); el.classList.add('held'); };
      el.onpointermove = (e) => { if (on) el.style.transform = 'translate(' + (e.clientX - sx) + 'px,' + (e.clientY - sy) + 'px)'; };
      el.onpointerup = el.onpointercancel = (e) => { if (!on) return; on = false; el.classList.remove('held'); el.style.transform = ''; el.style.visibility = 'hidden'; const under = document.elementFromPoint(e.clientX, e.clientY); el.style.visibility = ''; const bin = under && under.closest('.pl-bin'); if (bin) answer(+bin.dataset.b); };
    }
    show();
  }

  // ---- Trace
  function trace(pack) {
    const list = PLAY.shuffle(pack.trace, rand).slice(0, PLAY.SET_SIZE.trace), done = [];
    (function one(r) {
      if (r >= list.length) return setDone('trace', pack, done);
      const T = list[r], st = PLAY.traceStart(T);
      const t = screen(back + steps(list.length, r) + '<div class="pl-ask">' + ear + '<p>' + esc(T.say) + '</p></div><div class="pl-trace"><div class="pl-model">' + look(T.show) + '</div><svg class="pl-pad" viewBox="-6 -6 112 112" role="img" aria-label="' + esc(T.say) + '"></svg></div><div class="pl-say" role="status"></div>', 'pl-game-trace');
      const pad = main.querySelector('.pl-pad'), note = main.querySelector('.pl-say');
      const pl = (P) => P.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      function draw() {
        let h = st.strokes.map((P) => '<polyline points="' + pl(P) + '" fill="none" stroke="#efe4c4" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>').join('');
        h += st.strokes.map((P) => '<polyline points="' + pl(P) + '" fill="none" stroke="#1b1f3b" stroke-width="1.6" stroke-dasharray="1.5 5" stroke-linecap="round"/>').join('');
        st.strokes.forEach((P, s) => { const upto = s < st.s ? P : s === st.s ? P.slice(0, st.i + 1) : []; if (upto.length > 1) h += '<polyline points="' + pl(upto) + '" fill="none" stroke="#2ec4b6" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>'; });
        if (!st.done) { const P = st.strokes[st.s], a = P[st.i], b = P[Math.min(P.length - 1, st.i + 4)], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
          h += '<g transform="translate(' + a[0].toFixed(1) + ',' + a[1].toFixed(1) + ') rotate(' + ang.toFixed(0) + ')"><path d="M9 -5L16 0L9 5" fill="none" stroke="#1b1f3b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>';
          h += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="6.5" fill="#ff5fa2" stroke="#1b1f3b" stroke-width="2.5"/>' + (st.i === 0 ? '<text x="' + (a[0] - 3).toFixed(1) + '" y="' + (a[1] + 3.6).toFixed(1) + '" font-size="10" font-weight="800" fill="#1b1f3b">' + (st.s + 1) + '</text>' : ''); }
        pad.innerHTML = h;
      }
      const pt = (e) => { const m = pad.getScreenCTM().inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [p.x, p.y]; };
      let down = false, last = null;
      pad.onpointerdown = (e) => { if (st.done) return; down = true; last = pt(e); pad.setPointerCapture(e.pointerId); PLAY.traceDown(st, ...last); };
      // A quick finger reports only a few points; walk the path between them in small steps so a fast, steady trace counts.
      pad.onpointermove = (e) => { if (!down || st.done) return; const p = pt(e), q = last || p, n = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 2)); last = p;
        for (let k = 1; k <= n && !st.done; k++) { const x = q[0] + (p[0] - q[0]) * k / n, y = q[1] + (p[1] - q[1]) * k / n; if (!st.on) PLAY.traceDown(st, x, y); else PLAY.traceMove(st, x, y); } // a finger that slides onto the dot starts there too
        draw(); if (st.done) finish(); };
      pad.onpointerup = pad.onpointercancel = () => { down = false; last = null; PLAY.traceUp(st); };
      function finish() { done.push(T.id); note.textContent = T.done; say(T.done, () => { if (!live(t)) return; note.insertAdjacentHTML('afterend', nextBtn); main.querySelector('.pl-next').onclick = () => one(r + 1); }); }
      draw(); say(T.say); main.querySelector('.pl-ear').onclick = () => say(T.say);
    })(0);
  }

  // ---- after a set: show a grown-up (what the child just did, in pictures)
  function setDone(game, pack, ids) {
    setsDone++;
    const shown = ids.map((id) => { const it = item(pack, id); if (it) return look(it.show); const tr = pack.trace.find((x) => x.id === id); return tr ? look(tr.show) : ''; }).join('');
    const t = screen('<div class="pl-grown"><div class="pl-did">' + shown + '</div><p class="big">You did it!</p><p>You kept trying, and you learned something.</p><p class="pl-show">Show a grown-up!</p><div class="pl-acts">' + (PLAY.shouldRest(setsDone) ? '<button class="pl-btn" data-a="rest">Next</button>' : '<button class="pl-btn" data-a="again">Play again</button><button class="pl-btn alt" data-a="home">Pick another game</button>') + '</div></div>', 'pl-done');
    say(WORDS.setDone);
    main.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { if (!live(t)) return; const a = b.dataset.a; if (a === 'again') start(game, pack); else if (a === 'rest') rest(); else home(); });
  }
  // ---- gentle stopping: after a few sets the games rest for this visit
  function rest() {
    screen('<div class="pl-grown pl-rest">' + svg('star') + '<p class="big">All done for now.</p><p>Time to go play!</p><div class="pl-acts"><a class="pl-btn alt" href="/">Back to the start</a></div></div>', 'pl-done');
    say(WORDS.allDone);
  }

  home();
  say(WORDS.hello);
})();
