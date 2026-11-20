// VoidTV Trivia Nights: the phone's side (plan T9). Joins the big screen's room on VoidTV's room relay (the PLAY lead's;
// contract ROOMS-relay-contract-2026-11-20.md), sends a nickname if one is given and one answer per question, and shows
// what the screen sends back. Nothing is kept but a random seat token for this tab (so a phone that drops keeps its seat
// for a minute). Licence: GPL-2.0-or-later.
(function () {
  'use strict';
  const G = window.TriviaGame;
  // The project's donation setting (scripts/lib/app.js DONATE_URL); tests/trivia-host.test.js keeps it the same.
  const DONATE_URL = 'https://square.link/u/bJl9PGAC';
  const DONATE_LINE = 'If you found this service helpful, please think of donating to keep it running and to make more services like this possible. Every donation goes to CASH (cashvalues.org) and feeds its mission in the real world.';
  const SHAPES = ['▲', '◆', '●', '■'];
  const LETTERS = ['A', 'B', 'C', 'D'];
  const $ = (id) => document.getElementById(id);
  for (const e of document.querySelectorAll('.donate-line')) e.textContent = DONATE_LINE;
  for (const e of document.querySelectorAll('.donate-link')) e.href = DONATE_URL;
  // The donation mark (the winged CASH cross): one setting.
  const CROSS = '/assets/brand/cash-cross.png';
  for (const e of document.querySelectorAll('.donate-cross')) e.src = CROSS;

  const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  let ws = null, ended = false, tries = 0, current = null, asked = false;

  function only(id) { for (const s of ['note', 'name', 'wait', 'ask', 'res', 'end']) $(s).hidden = s !== id; }
  function note(h, p, link) { $('note-h').textContent = h; $('note-p').textContent = p; $('note-a').hidden = !link; only('note'); }
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* not on this phone */ } };

  // A random seat token for this tab only (sessionStorage), sent only to its room.
  function token() {
    let t = null;
    try { t = sessionStorage.getItem('voidtv-seat'); } catch (e) { /* private mode */ }
    if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      try { sessionStorage.setItem('voidtv-seat', t); } catch (e) { /* fine */ }
    }
    return t;
  }

  function drawQuestion(m) {
    current = m.n;
    $('num').textContent = 'Question ' + (m.n + 1) + ' of ' + m.of;
    $('q').textContent = m.q || 'Look at the big screen.';
    const box = $('answers');
    box.textContent = '';
    if (m.kind === 'year') { drawYear(box, m); only('ask'); return; }
    box.style.gridTemplateRows = 'repeat(' + m.choices.length + ',1fr)';
    box.classList.toggle('locked', m.pick !== null && m.pick !== undefined);
    m.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'a a' + i + (m.pick === i ? ' picked' : '');
      b.title = 'Answer ' + LETTERS[i];
      const s = document.createElement('span'); s.className = 's'; s.textContent = SHAPES[i]; s.setAttribute('aria-hidden', 'true');
      const l = document.createElement('span'); l.className = 'l'; l.textContent = LETTERS[i];
      const t = document.createElement('span'); t.textContent = c;
      b.append(s, l, t);
      b.addEventListener('click', () => {
        if (box.classList.contains('locked')) return;
        box.classList.add('locked'); b.classList.add('picked'); buzz();
        send({ type: 't-a', n: current, pick: i });
      });
      box.appendChild(b);
    });
    only('ask');
  }

  // Closest without going over: a year slider with nudge buttons and a Lock in button. One guess per question.
  function drawYear(box, m) {
    box.style.gridTemplateRows = '';
    const locked = m.guess !== null && m.guess !== undefined;
    box.classList.toggle('locked', locked);
    const mid = Math.round((m.min + m.max) / 2);
    let year = locked ? m.guess : mid;
    const wrap = document.createElement('div'); wrap.className = 'yearpick';
    const big = document.createElement('div'); big.className = 'yearbig'; big.textContent = String(year);
    const slide = document.createElement('input');
    slide.type = 'range'; slide.min = m.min; slide.max = m.max; slide.step = 1; slide.value = year; slide.disabled = locked;
    slide.setAttribute('aria-label', 'Your year');
    const row = document.createElement('div'); row.className = 'nudge';
    const set = (y) => { year = Math.max(m.min, Math.min(m.max, y)); slide.value = year; big.textContent = String(year); };
    for (const [label, d] of [['-10', -10], ['-1', -1], ['+1', 1], ['+10', 10]]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'plain'; b.textContent = label; b.title = 'Change the year by ' + d; b.disabled = locked;
      b.addEventListener('click', () => set(year + d));
      row.appendChild(b);
    }
    slide.addEventListener('input', () => set(+slide.value));
    const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.title = 'Send this year'; go.disabled = locked;
    go.textContent = locked ? 'Locked in: ' + m.guess : 'Lock in';
    go.addEventListener('click', () => {
      if (box.classList.contains('locked')) return;
      box.classList.add('locked'); go.disabled = true; slide.disabled = true; for (const b of row.children) b.disabled = true;
      go.textContent = 'Locked in: ' + year; buzz();
      send({ type: 't-a', n: current, year });
    });
    const note = document.createElement('p'); note.textContent = 'The closest guess that is not past the year wins.';
    wrap.append(big, slide, row, go, note);
    box.appendChild(wrap);
  }

  // The Shelf's final: bet part of your score with a slider, then lock it in. Right wins the bet; wrong loses it.
  function drawBet(m) {
    current = null;
    $('num').textContent = 'Final question';
    $('q').textContent = 'The category: ' + (m.cat || 'trivia') + '. How much do you bet?';
    const box = $('answers');
    box.textContent = '';
    box.style.gridTemplateRows = '';
    box.classList.remove('locked');
    const wrap = document.createElement('div'); wrap.className = 'yearpick';
    const big = document.createElement('div'); big.className = 'yearbig';
    let bet = 0;
    const slide = document.createElement('input');
    slide.type = 'range'; slide.min = 0; slide.max = m.max; slide.step = Math.max(1, Math.round(m.max / 50)); slide.value = 0;
    slide.setAttribute('aria-label', 'Your bet');
    const set = (v) => { bet = Math.max(0, Math.min(m.max, Math.round(v))); slide.value = bet; big.textContent = bet.toLocaleString(); };
    set(0);
    slide.addEventListener('input', () => set(+slide.value));
    const row = document.createElement('div'); row.className = 'nudge';
    for (const [label, v] of [['None', 0], ['Half', m.max / 2], ['All in', m.max]]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'plain'; b.textContent = label; b.title = 'Bet ' + label.toLowerCase();
      b.addEventListener('click', () => set(v));
      row.appendChild(b);
    }
    row.style.gridTemplateColumns = 'repeat(3,1fr)';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = 'Lock in my bet'; go.title = 'Send this bet';
    go.addEventListener('click', () => {
      go.disabled = true; slide.disabled = true; for (const b of row.children) b.disabled = true;
      go.textContent = 'Bet locked: ' + bet.toLocaleString(); buzz();
      send({ type: 't-bet', amount: bet });
    });
    const note = document.createElement('p'); note.textContent = m.max > 0 ? 'You have ' + m.max.toLocaleString() + ' points to bet.' : 'You have no points to bet this time; lock in 0 and answer for fun.';
    wrap.append(big, slide, row, go, note);
    box.appendChild(wrap);
    only('ask');
  }

  function onMessage(m) {
    if (m.type === 't-bet-ask') { drawBet(m); return; }
    if (m.type === 't-bet-got') return;
    if (m.type === 'hello') { tries = 0; return; }
    if (m.type === 't-you') {
      $('me').textContent = m.name;
      if (m.refused) { $('name-err').textContent = 'That name cannot go on the big screen. Try another, or just play.'; if (!$('wait').hidden) only('name'); return; }
      if (!asked && !m.named) { asked = true; only('name'); }
      else if (!$('name').hidden && m.named) only('wait');
      return;
    }
    if (m.type === 't-wait') { if ($('name').hidden) { $('wait-h').textContent = 'Waiting'; $('wait-p').textContent = m.text; only('wait'); } return; }
    if (m.type === 't-q') { drawQuestion(m); return; }
    if (m.type === 't-got') { $('wait-h').textContent = 'Locked in: ' + (m.year != null ? m.year : LETTERS[m.pick]); return; }
    if (m.type === 't-res' && m.kind === 'year') {
      $('res-num').textContent = 'Question ' + (m.n + 1);
      const h = $('res-h');
      h.className = 'result ' + (m.right ? 'right' : 'wrong');
      h.textContent = m.points === 1000 ? 'Spot on!' : m.right ? 'Closest!' : m.guess == null ? 'No guess' : 'Not this time';
      $('res-p').textContent = 'It was ' + m.year + '.' + (m.guess != null ? ' You said ' + m.guess + '.' : '') + (m.points ? ' +' + m.points.toLocaleString() + ' points' : '');
      $('res-total').textContent = m.score.toLocaleString() + ' points, ' + G.ordinal(m.place) + ' of ' + m.of;
      only('res');
      return;
    }
    if (m.type === 't-res') {
      $('res-num').textContent = 'Question ' + (m.n + 1);
      const h = $('res-h');
      h.className = 'result ' + (m.right ? 'right' : 'wrong');
      h.textContent = m.right ? 'Right!' : m.pick === null ? 'No answer' : 'Not this time';
      $('res-p').textContent = m.right ? '+' + m.points.toLocaleString() + ' points' : 'It was ' + LETTERS[m.answer] + '.' + (m.points < 0 ? ' You lose ' + (-m.points).toLocaleString() + ' points.' : '');
      $('res-total').textContent = m.score.toLocaleString() + ' points, ' + G.ordinal(m.place) + ' of ' + m.of;
      only('res');
      return;
    }
    if (m.type === 't-end') { $('end-p').textContent = m.score.toLocaleString() + ' points. You came ' + G.ordinal(m.place) + ' of ' + m.of + '.'; only('end'); return; }
    if (m.type === 'host-gone') { ended = true; note('The big screen closed', 'Scan the new code on the big screen to play again.', true); }
  }

  function connect() {
    if (!/^[2-9A-Z]{4}$/.test(code)) { note('No room code', 'Scan the code on the big screen, or type it.', true); return; }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room/' + code + '/join?t=' + token());
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
    ws.onclose = (e) => {
      ws = null;
      if (ended) return;
      if (e.code === 4404) { note('No game with that code', 'The code changes each game. Check the big screen.', true); return; }
      if (e.code === 4409) { note('This game is full', 'Up to 200 phones can join one screen.', false); return; }
      if (e.code === 4423) { note('This game is locked', 'The big screen is not letting new phones in right now.', false); return; }
      if (e.code === 4403) { ended = true; note('The big screen removed this phone', 'Ask whoever runs the screen if that was a mistake.', false); return; }
      if (e.code === 4410 || e.code === 4408) { note('The big screen closed', 'Scan the new code on the big screen to play again.', true); return; }
      // A dropped connection (walking out of Wi-Fi range): try again, a little slower each time; the seat is kept a minute.
      note('Reconnecting', 'The connection dropped. Trying again.', false);
      setTimeout(connect, Math.min(8000, 500 * 2 ** tries++));
    };
  }

  $('name-f').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('name-i').value.trim();
    if (!v) return;
    $('name-err').textContent = '';
    send({ type: 't-hi', name: v.slice(0, 16) });
    $('wait-h').textContent = 'Waiting'; $('wait-p').textContent = 'The game starts soon.';
    only('wait');
  });
  $('skip').addEventListener('click', () => { $('wait-h').textContent = 'Waiting'; $('wait-p').textContent = 'The game starts soon.'; only('wait'); });

  // Keep the phone's screen on during the game.
  let lock = null;
  async function stayAwake() { try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { /* not allowed */ } }
  addEventListener('pointerdown', stayAwake, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });
  connect();
})();
