// The flip side of a lecture, on the page (Bryan, 22 Nov 2026: "we have the teacher talking into space ... we take
// the empty space and create the inverse of the answers and where to look"; "pertinent data and info populate based
// on the words and times"; a Void TV logo in a grad hat in the corner of the screen "can be an answer that will be
// needed"). The data is made by `node scripts/uni.js flip <course> <unit>`; build.js ships it as flip-<course>-<n>.json
// and puts one <div class="flip" data-flip="..."> under the lecture. This script does the rest:
//   the lecture and its flip side sit side by side, the words under the picture; the flip side follows the lecture's clock
//   the question the teacher is about to answer shows first; it turns over to the teacher's own words when they are said
//   the words light up as they are said, and any word jumps the lecture to its second
//   what is named shows as it is said, with what the University holds for it
//   the hat sits on the corner of the picture while the answer being given is one that will be needed
//   every question of the lecture is a list that jumps to its stretch
// Nothing is kept but two switches (vu:flip), in this browser only. One engine for every lecture; a flip side is data.
(function () {
  var CSS = '.flipwrap{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px;align-items:start;margin-top:6px}'
    + '.flipwrap .flipmedia{position:relative;min-width:0}.flipwrap video{margin-top:0;display:block;width:100%;height:auto;aspect-ratio:16/9}.flipmedia.aud{padding-top:78px}'
    + '@media (max-width:980px){.flipwrap{grid-template-columns:1fr}}'
    + '.flip{min-width:0;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45}'
    + '.flip[hidden]{display:none}'
    + '.fl-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fl-top b{font-family:var(--head);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}.fl-top i{font-style:normal;color:var(--dim);font-size:13px;margin-right:auto}'
    + '.fl-sw{font:inherit;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}.fl-sw:hover{border-color:var(--gold)}.fl-sw.on{color:var(--fg);border-color:var(--gold);background:var(--chip)}'
    + '.fl-card{position:relative;border:1px solid var(--line);border-radius:12px;background:var(--panel3,var(--panel2));padding:12px 14px;min-height:104px;transition:transform .22s ease,border-color .22s}'
    + '.fl-card.turning{transform:scaleX(.04)}.fl-card.back{border-color:var(--gold)}'
    + '.fl-side{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);display:flex;gap:8px;align-items:center}.fl-card.back .fl-side{color:var(--gold)}'
    + '.fl-q{font-family:var(--head);font-size:19px;line-height:1.25;margin:6px 0 8px;color:var(--fg)}.fl-quote{font-size:15px;margin:6px 0 8px;color:var(--fg)}.fl-under{font-size:12px;color:var(--dim);margin-bottom:8px}'
    + '.fl-acts{display:flex;gap:8px;flex-wrap:wrap}.fl-btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer}.fl-btn:hover{border-color:var(--gold)}.fl-btn.go{border-color:var(--gold);color:var(--gold)}'
    + '.fl-need{display:flex;gap:8px;align-items:flex-start;border-left:3px solid var(--gold);padding:4px 10px;font-size:13px;color:var(--fg)}.fl-need[hidden]{display:none}.fl-need svg{flex:none;width:22px;height:22px;margin-top:1px}.fl-need button{font:inherit;font-size:12px;background:none;border:0;color:var(--gold);cursor:pointer;padding:0 3px;text-decoration:underline}'
    + '.fl-said{display:flex;gap:6px;flex-wrap:wrap;min-height:26px;align-items:center}.fl-said>span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}'
    + '.fl-chip{font:inherit;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--fg);cursor:pointer;animation:flin .35s ease}.fl-chip em{font-style:normal;color:var(--dim);margin-right:5px}.fl-chip.held{border-color:var(--gold)}.fl-chip.held em{color:var(--gold)}.fl-chip:hover{border-color:var(--fg)}'
    + '@keyframes flin{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'
    + '.fl-info{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;background:var(--panel2)}.fl-info[hidden]{display:none}.fl-info b{display:block}.fl-info a{color:var(--gold)}'
    + '.fl-words{max-height:132px;overflow:auto;font-size:14px;line-height:1.6;color:var(--dim);margin-top:8px;padding:2px 4px 2px 0}.fl-words span{cursor:pointer;border-radius:3px}.fl-words span.said{color:var(--fg)}.fl-words span.now{background:var(--gold);color:#111}.fl-words span.ans{text-decoration:underline;text-decoration-color:var(--gold);text-underline-offset:3px}.fl-words span.low{border-bottom:1px dotted var(--pink,#ff4fc8)}.fl-words span:hover{outline:1px solid var(--line)}'
    + '.fl-all>summary{cursor:pointer;font-size:13px;color:var(--gold);list-style:none}.fl-all>summary::-webkit-details-marker{display:none}.fl-list{max-height:220px;overflow:auto;margin:6px 0 0;padding:0;list-style:none}.fl-list button{display:flex;gap:8px;width:100%;text-align:left;font:inherit;font-size:13px;padding:5px 8px;border:0;border-radius:6px;background:none;color:var(--fg);cursor:pointer}.fl-list button:hover{background:var(--panel2)}.fl-list button.on{background:var(--chip)}.fl-list i{font-style:normal;color:var(--gold);flex:none;width:44px}.fl-list svg{flex:none;width:16px;height:16px;margin-left:auto}.fl-list .hk{color:var(--dim)}'
    + '.fl-hat{position:absolute;top:10px;right:10px;width:64px;height:64px;border:0;padding:0;background:none;cursor:pointer;opacity:0;transform:scale(.6) translateY(-8px);transition:opacity .3s,transform .3s;pointer-events:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}.fl-hat.on{opacity:1;transform:none;pointer-events:auto}.fl-hat svg{width:100%;height:100%;display:block}'
    + '@media (prefers-reduced-motion:reduce){.fl-card,.fl-hat{transition:none}.fl-chip{animation:none}}';
  // The Void TV mark wearing a mortarboard. mark is the picture's address; without it the hat still shows on a plain disc.
  function hat(mark) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">'
      + (mark ? '<image href="' + mark + '" x="10" y="18" width="44" height="44"/>' : '<circle cx="32" cy="40" r="22" fill="#10131c" stroke="#f2a93b" stroke-width="2"/>')
      + '<path d="M32 4 L60 15 L32 26 L4 15 Z" fill="#11131a" stroke="#f2a93b" stroke-width="1.6" stroke-linejoin="round"/>'
      + '<path d="M18 21 V28 C24 33 40 33 46 28 V21" fill="#11131a" stroke="#f2a93b" stroke-width="1.6" stroke-linejoin="round"/>'
      + '<path d="M56 16.5 V30" stroke="#f2a93b" stroke-width="1.6" stroke-linecap="round"/><circle cx="56" cy="32" r="2.6" fill="#f2a93b"/></svg>';
  }
  var clock = function (t) { t = Math.max(0, t); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var KIND = { person: 'Person', work: 'Work', study: 'Study', term: 'Term', number: 'Number', place: 'Place', mechanism: 'The mind at work', reading: 'Reading' };
  var store = { get: function () { try { return JSON.parse(localStorage.getItem('vu:flip')) || {}; } catch (e) { return {}; } }, set: function (v) { try { localStorage.setItem('vu:flip', JSON.stringify(v)); } catch (e) {} } };

  // Which stretch the clock is in: the last one that has begun. Pure.
  function stretchAt(S, t) { var k = 0; for (var i = 0; i < S.length; i++) if (S[i].s <= t + 0.001) k = i; return k; }
  // The word being said: the last word of the stretch that has begun. -1 before the first. Pure.
  function wordAt(st, t) { var k = -1; for (var i = 0; i < st.w.length; i++) if (st.w[i][1] <= t + 0.001) k = i; else break; return k; }

  function mount(box, data) {
    var unit = box.closest('.unit'); var v = unit && unit.querySelector('.piece.main video, .piece.main audio');
    if (!v || !data || !data.stretches || !data.stretches.length) return;
    var S = data.stretches; var prefs = store.get();
    // the lecture and its flip side, side by side
    var wrap = document.createElement('div'); wrap.className = 'flipwrap';
    var media = document.createElement('div'); media.className = 'flipmedia';
    v.parentNode.insertBefore(wrap, v); media.appendChild(v); wrap.appendChild(media); wrap.appendChild(box);
    var hatBtn = document.createElement('button'); hatBtn.type = 'button'; hatBtn.className = 'fl-hat'; hatBtn.innerHTML = hat(box.dataset.mark);
    hatBtn.title = 'An answer you will need is being given now. Press to see why.';
    media.appendChild(hatBtn);
    box.innerHTML = '<div class="fl-top"><b>The flip side</b><i></i>'
      + '<button type="button" class="fl-sw" data-sw="ask" title="When this is on, the lecture stops at the start of each part and asks you the question first. Guess, then let the teacher answer.">Ask me first</button></div>'
      + '<div class="fl-card"><div class="fl-side"></div><div class="fl-body"></div><div class="fl-acts"></div></div>'
      + '<div class="fl-need" hidden></div>'
      + '<div class="fl-said"></div><div class="fl-info" hidden></div>'
      + '<div class="fl-words" title="The teacher\'s words, lit as they are said. Press any word to hear the lecture from there."></div>'
      + '<details class="fl-all"><summary title="Every question this lecture answers, in order. Press one to go to that part.">Every question this lecture answers (' + S.filter(function (s) { return s.q; }).length + ')</summary><ol class="fl-list">'
      + S.map(function (s, i) { return '<li><button type="button" data-k="' + i + '" title="Go to ' + clock(s.s) + '"><i>' + clock(s.s) + '</i><span' + (s.q ? '' : ' class="hk"') + '>' + esc(s.q || (s.hk ? 'Housekeeping' : 'No question for this part')) + '</span>' + (s.need && s.need.length ? hat('') : '') + '</button></li>'; }).join('')
      + '</ol></details>';
    box.hidden = false;
    var $ = function (q) { return box.querySelector(q); };
    var card = $('.fl-card'), side = $('.fl-side'), body = $('.fl-body'), acts = $('.fl-acts'), need = $('.fl-need'), said = $('.fl-said'), info = $('.fl-info'), words = $('.fl-words'), when = $('.fl-top i'), sw = $('.fl-sw');
    var cur = -1, shown = '', turned = {}, asked = {}, lastWord = -2, spans = [], chips = 0;
    // the words sit under the picture, like captions; everything else is the flip side beside it
    media.appendChild(words); if (v.tagName === 'AUDIO') media.classList.add('aud');
    sw.classList.toggle('on', !!prefs.ask);
    var seek = function (t, play) { var go = function () { v.currentTime = t; if (play !== false) v.play(); }; if (v.readyState < 1) { v.preload = 'metadata'; v.addEventListener('loadedmetadata', go, { once: true }); v.load(); } else go(); };

    function face(st, back, why) { // paint one side of the card
      var key = st.n + (back ? 'b' : 'f');
      if (shown === key) return;
      var paint = function () {
        card.classList.toggle('back', back);
        if (!st.q) { side.textContent = st.hk ? 'Housekeeping' : 'This part'; body.innerHTML = '<div class="fl-under">' + (st.hk ? 'The teacher is on course business here. No question.' : 'No question was written for this part. The words are below.') + '</div>'; acts.innerHTML = ''; return; }
        if (!back) {
          side.textContent = 'The question this part answers';
          body.innerHTML = '<div class="fl-q">' + esc(st.q) + '</div><div class="fl-under">The teacher answers at ' + clock(st.a[1]) + '. ' + (why || 'Guess first.') + '</div>';
          acts.innerHTML = (v.paused && asked[st.n] === 1 ? '<button type="button" class="fl-btn go" data-do="guess" title="Carry on with the lecture and hear the teacher\'s answer.">I have my guess, play</button>' : '')
            + '<button type="button" class="fl-btn" data-do="turn" title="Show the teacher\'s own words now, without waiting.">Turn it over</button>';
        } else {
          side.textContent = 'The teacher\'s words, at ' + clock(st.a[1]);
          body.innerHTML = '<div class="fl-under">' + esc(st.q) + '</div><div class="fl-quote">"' + esc(st.a[0]) + '"</div>';
          acts.innerHTML = '<button type="button" class="fl-btn go" data-do="hear" title="Play the lecture from the second the teacher says this.">Hear it said</button><button type="button" class="fl-btn" data-do="front" title="Back to the question.">Turn it back</button>';
        }
      };
      var first = shown === '' || shown.replace(/[bf]$/, '') !== String(st.n);
      shown = key;
      if (first || matchMedia('(prefers-reduced-motion:reduce)').matches) { paint(); return; }
      card.classList.add('turning'); setTimeout(function () { paint(); card.classList.remove('turning'); }, 220);
    }
    function enter(k) { // a new stretch
      cur = k; var st = S[k]; lastWord = -2; chips = 0;
      when.textContent = 'Part ' + st.n + ' of ' + S.length + ', ' + clock(st.s) + ' to ' + clock(st.e);
      words.innerHTML = st.w.map(function (w, i) { return '<span data-i="' + i + '"' + ((st.low || []).indexOf(i) >= 0 ? ' class="low" title="The listener was not sure of this word."' : '') + '>' + esc(w[0]) + '</span>'; }).join(' ');
      spans = words.querySelectorAll('span');
      if (st.a) for (var i = 0; i < st.w.length; i++) if (st.w[i][1] >= st.a[1] - 0.001 && st.w[i][2] <= st.a[2] + 0.001) spans[i].classList.add('ans');
      said.innerHTML = '<span>Said so far</span>'; info.hidden = true;
      var nd = st.need || [];
      need.hidden = !nd.length;
      need.innerHTML = nd.length ? hat('') + '<div>' + nd.map(function (x) { return x.why === 'quiz' ? 'You will need this: Check yourself asks "' + esc(x.q) + '"' : 'You will need this: "' + esc(x.name) + '" is first said here and comes back ' + x.again + ' times, at ' + x.at.map(function (t) { return '<button type="button" data-t="' + t + '" title="Go to ' + clock(t) + '">' + clock(t) + '</button>'; }).join(' '); }).join('<br>') + '</div>' : '';
      box.querySelectorAll('.fl-list button').forEach(function (b) { b.classList.toggle('on', +b.dataset.k === k); });
      var on = box.querySelector('.fl-list button.on'); if (on && $('.fl-all').open) on.scrollIntoView({ block: 'nearest' });
    }
    function tick() {
      var t = v.currentTime || 0; var k = stretchAt(S, t);
      if (k !== cur) {
        enter(k);
        // Ask me first: stop at the start of a part that has a question, once, and wait for the guess
        if (prefs.ask && S[k].q && !asked[S[k].n] && !v.paused && t - S[k].s < 1.5 && t < S[k].a[1]) { asked[S[k].n] = 1; v.pause(); }
      }
      var st = S[cur];
      var back = !!st.q && (turned[st.n] === true || (turned[st.n] !== false && t >= st.a[1]));
      face(st, back);
      hatBtn.classList.toggle('on', !!(st.need && st.need.length) && !!st.a && t >= st.a[1] && t <= st.e);
      var w = wordAt(st, t);
      if (w !== lastWord) {
        for (var i = 0; i < spans.length; i++) { spans[i].classList.toggle('said', i <= w); spans[i].classList.toggle('now', i === w && !v.paused); }
        if (w >= 0 && spans[w] && (spans[w].offsetTop < words.scrollTop || spans[w].offsetTop > words.scrollTop + words.clientHeight - 24)) words.scrollTop = Math.max(0, spans[w].offsetTop - words.offsetTop - 30);
        lastWord = w;
      }
      // what has been said so far in this part: what the University holds first, then the rest
      var list = (st.shows || []).map(function (x) { return { t: x[4], kind: x[0], text: x[1], note: x[2], link: x[3], held: true }; })
        .concat((st.names || []).filter(function (x) { return !x[3]; }).map(function (x) { return { t: x[2], kind: x[1], text: x[0], held: false }; }))
        .filter(function (x) { return x.t <= t + 0.001; }).sort(function (a, b) { return a.t - b.t; });
      if (list.length !== chips) {
        chips = list.length;
        said.innerHTML = '<span>Said so far</span>' + list.map(function (x, i) { return '<button type="button" class="fl-chip' + (x.held ? ' held' : '') + '" data-c="' + i + '" title="' + (x.held ? 'The University has this. Press to see it.' : 'Said at ' + clock(x.t) + '. Press to hear it said.') + '"><em>' + esc(KIND[x.kind] || x.kind) + '</em>' + esc(x.text) + '</button>'; }).join('');
        said._list = list;
      }
    }
    var raf = 0; var loop = function () { tick(); raf = v.paused ? 0 : requestAnimationFrame(loop); };
    v.addEventListener('play', function () { if (!raf) loop(); });
    // a stop or a start repaints the card's side, so "I have my guess, play" comes and goes with the stop
    ['pause', 'play', 'seeked', 'timeupdate', 'loadedmetadata'].forEach(function (ev) { v.addEventListener(ev, function () { lastWord = -2; if (ev === 'pause' || ev === 'play') shown = ''; tick(); }); });
    var onClick = function (e) {
      var st = S[cur]; var b;
      if ((b = e.target.closest('[data-do]'))) {
        var d = b.dataset.do;
        if (d === 'turn') { turned[st.n] = true; tick(); }
        else if (d === 'front') { turned[st.n] = false; tick(); }
        else if (d === 'hear') { turned[st.n] = true; seek(st.a[1]); }
        else if (d === 'guess') { asked[st.n] = 2; v.play(); }
      } else if ((b = e.target.closest('.fl-list button'))) { var k = +b.dataset.k; turned[S[k].n] = undefined; asked[S[k].n] = asked[S[k].n] || 2; seek(S[k].s); }
      else if ((b = e.target.closest('.fl-need button'))) seek(+b.dataset.t);
      else if ((b = e.target.closest('.fl-words span'))) { asked[st.n] = asked[st.n] || 2; seek(st.w[+b.dataset.i][1]); }
      else if ((b = e.target.closest('.fl-chip'))) {
        var x = said._list[+b.dataset.c];
        if (!x.held) { seek(x.t); return; }
        info.hidden = false;
        info.innerHTML = '<b>' + esc(x.text) + '</b>' + esc(x.note || '') + ' ' + (x.link ? '<a href="' + esc(x.link) + '"' + (/^https?:/.test(x.link) ? ' target="_blank" rel="noopener"' : '') + ' title="Open what the University has on this.">Open it</a>' : '');
      } else if ((b = e.target.closest('.fl-sw'))) { prefs.ask = !prefs.ask; store.set(prefs); b.classList.toggle('on', prefs.ask); }
    };
    box.addEventListener('click', onClick); words.addEventListener('click', onClick);
    hatBtn.addEventListener('click', function () { need.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); need.animate([{ background: 'rgba(242,169,59,.35)' }, { background: 'transparent' }], { duration: 900 }); });
    box._flip = { tick: tick, data: data, video: v, state: function () { return { part: cur + 1, shown: shown, hat: hatBtn.classList.contains('on'), chips: chips, word: lastWord }; } };
    tick();
  }

  function start() {
    var boxes = document.querySelectorAll('.flip[data-flip]');
    if (!boxes.length) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    boxes.forEach(function (box) {
      fetch(box.dataset.flip).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) mount(box, d); }).catch(function () {});
    });
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { stretchAt: stretchAt, wordAt: wordAt }; return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
