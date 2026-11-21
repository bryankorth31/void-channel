// Trivia Night marking page (plan C0). Talks to scripts/trivia/mark.js on this PC; the server checks every save
// against the catalog before writing it to trivia/moments/.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const v = $('v');
  const S = { titles: [], cur: null, files: [], file: null, start: null, previewing: false };

  function mmss(t) { const s = Math.max(0, t); const m = Math.floor(s / 60); const r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function kind() { return document.querySelector('input[name=kind]:checked').value; }
  function len() { return Number(document.querySelector('input[name=len]:checked').value); }
  function end() { return kind() === 'still' ? S.start : Math.min(S.start + len(), S.file ? S.file.seconds : Infinity); }
  function say(text, cls) { const s = $('status'); s.textContent = text; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function store(k, val) { try { if (val === undefined) return localStorage.getItem(k); localStorage.setItem(k, val); } catch { return null; } return null; }
  async function api(url, opts) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The server said ' + r.status);
    return j;
  }

  // ---------- the list ----------
  function rankText(t) { return t.rank ? '#' + t.rank : ''; }
  function drawList() {
    const q = $('find').value.trim().toLowerCase();
    const list = S.titles.filter((t) => !q || t.name.toLowerCase().includes(q));
    const ranked = S.titles.filter((t) => t.rank).length;
    $('listHint').textContent = list.length + ' of ' + S.titles.length + ' that play' + (ranked ? '; ' + ranked + ' ranked by the fame list come first' : '; the fame list is not built yet');
    const ul = $('titles');
    ul.textContent = '';
    for (const t of list.slice(0, 400)) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.title = (t.kind === 'film' ? 'Film' : 'Show, ' + t.eps + ' episodes ready for clips') + (t.rank ? '; number ' + t.rank + ' on the fame list' : '') + (t.moments ? '; ' + t.moments + ' moments saved' : '');
      if (S.cur && S.cur.key === t.key) b.setAttribute('aria-current', 'true');
      b.innerHTML = '<span class="r"></span><span class="t"></span><span class="m"></span>';
      b.querySelector('.r').textContent = rankText(t);
      b.querySelector('.t').textContent = t.name + (t.year ? ' (' + t.year + ')' : '');
      b.querySelector('.m').textContent = t.moments ? t.moments + ' saved' : '';
      b.onclick = () => openTitle(t);
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  async function loadTitles() {
    S.titles = await api('/api/titles');
    drawList();
  }

  // ---------- one title ----------
  async function openTitle(t) {
    S.cur = t;
    $('empty').hidden = true;
    $('title').hidden = false;
    $('tname').textContent = t.name + (t.year ? ' (' + t.year + ')' : '');
    const fameBuilt = S.titles.some((x) => x.rank);
    $('where').textContent = t.rank ? 'Number ' + t.rank + ' on the fame list of ' + (t.kind === 'film' ? 'films' : 'TV shows') : fameBuilt ? 'Not in the top 500 of the fame list' : '';
    S.files = await api('/api/files?key=' + encodeURIComponent(t.key));
    const sel = $('file');
    sel.textContent = '';
    S.files.forEach((f, i) => { const o = document.createElement('option'); o.value = i; o.textContent = f.label + ' (' + mmss(f.seconds).replace(/\.\d$/, '') + ')'; sel.appendChild(o); });
    sel.hidden = S.files.length < 2;
    loadFile(0);
    drawList();
    await drawSaved();
  }

  function loadFile(i, at) {
    S.file = S.files[i];
    $('file').value = String(i);
    S.start = null;
    S.w = { ask: null, lock: null, reveal: null };   // a whodunit's times belong to one episode
    S.previewing = false;
    drawMarked();
    if (!S.file) return;
    if (v.getAttribute('src') !== S.file.url) v.src = S.file.url;
    if (at !== undefined) { const go = () => { v.currentTime = at; }; if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true }); }
    say('Playing from archive.org: ' + S.file.item);
    loadLines();
  }

  // ---------- what is said (the episode's timed transcript, plan C18) ----------
  S.lines = [];
  S.nowLine = -1;
  async function loadLines() {
    const f = S.file;
    S.lines = [];
    S.nowLine = -1;
    $('linesBox').hidden = true;
    if (!f || f.season === undefined) return;
    let t;
    try { t = await api('/api/transcript?key=' + encodeURIComponent(S.cur.key) + '&season=' + f.season + '&number=' + f.number); } catch { return; }
    if (S.file !== f || !t.lines.length) return;
    S.lines = t.lines;
    $('linesSrc').textContent = t.source && t.source.kind === 'whisper'
      ? '(heard by Whisper on this PC: check the words before you save)'
      : '(from the Archive item\'s own subtitle file)';
    drawLines();
    $('linesBox').hidden = false;
  }

  function drawLines() {
    const q = $('lineFind').value.trim().toLowerCase();
    const ol = $('lines');
    ol.textContent = '';
    S.lines.forEach((l, i) => {
      if (q && !l.text.toLowerCase().includes(q)) return;
      const li = document.createElement('li');
      li.dataset.i = i;
      li.innerHTML = '<span class="t"></span><span></span>';
      li.firstChild.textContent = mmss(l.start).replace(/\.\d$/, '');
      li.lastChild.textContent = l.text;
      li.onclick = () => pickLine(i);
      ol.appendChild(li);
    });
  }

  // A line picked from the transcript: the video goes a second before it, the start is marked there, the kind is Line,
  // the words are filled in for the person to check, and the length covers the whole line.
  function pickLine(i) {
    const l = S.lines[i];
    S.start = Math.max(0, Math.round((l.start - 1) * 10) / 10);
    document.querySelector('input[name=kind][value=line]').checked = true;
    document.querySelector('input[name=len][value="' + (l.end + 0.5 - S.start > 10 ? 15 : 10) + '"]').checked = true;
    $('line').value = l.text;
    onKind();
    v.currentTime = S.start;
    for (const li of $('lines').children) li.classList.toggle('marked', Number(li.dataset.i) === i);
    say('Line marked from ' + mmss(S.start) + '. Check the words against what you hear (Play the moment), fix them if needed, then save.');
  }

  function followLine() {
    if (!S.lines.length || $('linesBox').hidden) return;
    const t = v.currentTime;
    let i = -1;
    for (let k = 0; k < S.lines.length && S.lines[k].start <= t; k++) i = k;
    if (i === S.nowLine) return;
    S.nowLine = i;
    for (const li of $('lines').children) li.classList.toggle('now', Number(li.dataset.i) === i);
  }

  // A whodunit's three times: guessing opens, guesses close, the episode reveals it (seconds into the file).
  S.w = { ask: null, lock: null, reveal: null };
  const KIND_NAMES = { scene: 'Scene', line: 'Line', theme: 'Theme song', still: 'Still', find: 'Spot it', whodunit: 'Whodunit', clue: 'Clue' };

  function drawMarked() {
    if (kind() === 'whodunit') {
      const w = S.w, t = (x) => (x === null ? 'not set' : mmss(x));
      $('save').disabled = w.ask === null || w.lock === null || w.reveal === null;
      $('marked').textContent = 'Guessing opens ' + t(w.ask) + ', closes ' + t(w.lock) + ', revealed ' + t(w.reveal) + '.';
      return;
    }
    const has = S.start !== null;
    $('preview').disabled = !has;
    $('save').disabled = !has;
    $('marked').textContent = has
      ? (kind() === 'still' ? 'One frame at ' + mmss(S.start) : 'From ' + mmss(S.start) + ' to ' + mmss(end()) + ' (' + Math.round(end() - S.start) + ' s)')
      : kind() === 'find' ? 'Play, pause where the thing to spot first shows, then Mark start here.'
        : kind() === 'clue' ? 'Play, pause where the clue shows, then Mark start here.'
        : 'Nothing marked yet. Play, pause where the moment begins, then Mark start here.';
  }

  function onKind() {
    const k = kind();
    $('lenField').hidden = k === 'still' || k === 'whodunit';
    $('line').hidden = k !== 'line';
    $('find').hidden = k !== 'find';
    $('clue').hidden = k !== 'clue';
    $('who').hidden = k !== 'whodunit';
    $('markStart').hidden = k === 'whodunit';
    $('preview').hidden = k === 'whodunit';
    drawMarked();
  }

  function setW(which) {
    if (!S.file) return;
    S.w[which] = Math.round(v.currentTime * 10) / 10;
    drawMarked();
    say({ ask: 'Guessing opens at ', lock: 'Guesses close at ', reveal: 'Revealed at ' }[which] + mmss(S.w[which]) + '.');
  }

  function preview(from, to) {
    v.pause();
    v.currentTime = from;
    if (to === from) { say('The frame at ' + mmss(from)); return; }
    S.previewing = to;
    v.play().catch(() => say('Press Play on the video once, then try again.', 'err'));
  }

  v.addEventListener('timeupdate', () => {
    if (S.previewing !== false && v.currentTime >= S.previewing) { v.pause(); S.previewing = false; }
    followLine();
  });
  v.addEventListener('play', () => { $('pp').textContent = 'Pause'; });
  v.addEventListener('pause', () => { $('pp').textContent = 'Play'; });
  v.addEventListener('error', () => say('This file did not load from archive.org. Try another episode.', 'err'));

  async function drawSaved() {
    const list = await api('/api/moments?key=' + encodeURIComponent(S.cur.key));
    $('count').textContent = list.length ? '(' + list.length + ')' : '';
    const ul = $('saved');
    ul.textContent = '';
    if (!list.length) { const li = document.createElement('li'); li.textContent = 'None yet.'; ul.appendChild(li); }
    for (const m of list) {
      const li = document.createElement('li');
      const where = m.film ? '' : 'S' + m.season + ' E' + m.number + ', ';
      li.innerHTML = '<span class="k"></span><span class="d"><span class="w"></span><br><small></small></span>';
      li.querySelector('.k').textContent = KIND_NAMES[m.kind] || m.kind;
      li.querySelector('.w').textContent = m.kind === 'whodunit'
        ? where + m.q + ' ' + m.choices.join(', ') + '. Answer: ' + m.choices[m.answer] + '. Guessing ' + mmss(m.start) + ' to ' + mmss(m.lock) + ', revealed ' + mmss(m.end)
        : where + (m.kind === 'still' ? mmss(m.start) : mmss(m.start) + ' to ' + mmss(m.end)) + (m.line ? ': "' + m.line + '"' : '') + (m.find ? ': spot ' + m.find : '') + (m.clue ? ': clue, ' + m.clue : '') + (m.note ? ' (' + m.note + ')' : '');
      li.querySelector('small').textContent = 'Picked by ' + m.by + ', ' + new Date(m.at).toLocaleString();
      const play = document.createElement('button');
      play.textContent = 'Play';
      play.title = 'Play this saved moment';
      play.onclick = () => {
        const i = S.files.findIndex((f) => m.film || (f.season === m.season && f.number === m.number));
        if (i < 0) return say('That episode is not in the list any more.', 'err');
        if (S.files[i] !== S.file) loadFile(i, m.start);
        const go = () => (m.kind === 'whodunit' ? preview(Math.max(0, m.end - 5), m.end + 10) : preview(m.start, m.end));
        if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
      };
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.title = 'Delete this moment from the library';
      del.onclick = async () => {
        if (!confirm('Delete this moment? It is taken out of the library and clip rounds stop using it.')) return;
        try { await api('/api/moments?key=' + encodeURIComponent(S.cur.key) + '&id=' + encodeURIComponent(m.id), { method: 'DELETE' }); say('Deleted.', 'ok'); }
        catch (e) { say(e.message, 'err'); }
        await drawSaved();
        await refreshCount();
      };
      li.appendChild(play);
      li.appendChild(del);
      ul.appendChild(li);
    }
  }

  async function refreshCount() {
    const list = await api('/api/moments?key=' + encodeURIComponent(S.cur.key));
    const t = S.titles.find((x) => x.key === S.cur.key);
    if (t) t.moments = list.length;
    drawList();
  }

  async function save() {
    const by = $('by').value.trim();
    if (by.length < 2) { $('by').focus(); return say('Type your name at the top first; it goes on the moment.', 'err'); }
    if (kind() === 'line' && !$('line').value.trim()) { $('line').focus(); return say('Type the words heard for a line.', 'err'); }
    if (kind() === 'find' && $('find').value.trim().length < 3) { $('find').focus(); return say('Type what players should spot.', 'err'); }
    if (kind() === 'clue' && $('clue').value.trim().length < 3) { $('clue').focus(); return say('Type what the clue is.', 'err'); }
    const sus = [...document.querySelectorAll('#who .wc')].map((x) => x.value.trim());
    const pick = document.querySelector('input[name=wans]:checked');
    if (kind() === 'whodunit') {
      if (sus.some((x) => !x)) return say('Type all four suspects.', 'err');
      if (!pick) return say('Tick the suspect who did it.', 'err');
    }
    store('trivia-mark-by', by);
    const who = kind() === 'whodunit';
    const body = { key: S.cur.key, season: S.file.season, number: S.file.number, kind: kind(), start: who ? S.w.ask : S.start, end: who ? S.w.reveal : end(),
      line: kind() === 'line' ? $('line').value : '', find: $('find').value, clue: $('clue').value, note: $('note').value, by,
      q: $('wq').value, choices: sus, answer: pick ? Number(pick.value) : null, lock: S.w.lock };
    try {
      await api('/api/moments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      say('Saved. It was checked against the catalog.', 'ok');
      S.start = null;
      S.w = { ask: null, lock: null, reveal: null };
      for (const x of document.querySelectorAll('#who .wc')) x.value = '';
      for (const x of document.querySelectorAll('input[name=wans]')) x.checked = false;
      $('line').value = '';
      $('find').value = '';
      $('clue').value = '';
      $('note').value = '';
      drawMarked();
      await drawSaved();
      await refreshCount();
    } catch (e) { say('Not saved: ' + e.message, 'err'); }
  }

  // ---------- wiring ----------
  const seek = (d) => { v.currentTime = Math.max(0, Math.min((S.file && S.file.seconds) || v.duration || 0, v.currentTime + d)); };
  $('b5').onclick = () => seek(-5); $('b1').onclick = () => seek(-1); $('f1').onclick = () => seek(1); $('f5').onclick = () => seek(5);
  $('pp').onclick = () => { S.previewing = false; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  $('markStart').onclick = () => { if (!S.file) return; S.start = Math.round(v.currentTime * 10) / 10; drawMarked(); say('Start marked. Play the moment to check it, then save.'); };
  $('preview').onclick = () => { if (S.start !== null) preview(S.start, end()); };
  $('wAsk').onclick = () => setW('ask');
  $('wLock').onclick = () => setW('lock');
  $('wReveal').onclick = () => setW('reveal');
  $('save').onclick = save;
  $('file').onchange = () => loadFile(Number($('file').value));
  $('find').oninput = drawList;
  $('lineFind').oninput = drawLines;
  for (const r of document.querySelectorAll('input[name=kind], input[name=len]')) r.onchange = onKind;
  $('back').onclick = (e) => { e.preventDefault(); v.pause(); S.cur = null; $('title').hidden = true; $('empty').hidden = false; $('where').textContent = ''; drawList(); $('find').focus(); };
  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || !S.file || $('title').hidden) return;
    if (e.key === ' ') { e.preventDefault(); $('pp').click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(e.shiftKey ? -5 : -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(e.shiftKey ? 5 : 1); }
    else if (e.key === 'm' || e.key === 'M') $('markStart').click();
    else if (e.key === 'p' || e.key === 'P') $('preview').click();
  });
  $('by').value = store('trivia-mark-by') || '';
  onKind();
  loadTitles().catch((e) => { $('listHint').textContent = 'Could not load the list: ' + e.message; });
})();
