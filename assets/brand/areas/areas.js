/* Every voidtv.net area, in one list, with one menu and one small ad (Bryan, 20 Nov 2026: "i need all the different void
   areas and pages now baring cast, to be advertised and or displayed in the proper way on each others headers. either a
   hamburger menu wit ocassionall other small ads on thew other sightes". From the pictures he picked M1, a hamburger at the
   left that opens a side drawer, and A1, an HCN-style card between rows.)

   One file serves every area. voidtv.net, PLAY and Trivia load it from /assets/brand/areas/areas.js; the sites on their own
   address (University, Hindi) load it from https://voidtv.net/assets/brand/areas/areas.js, so a new area is ONE new line in
   AREAS below, and it shows everywhere on the next voidtv.net push, with no other site rebuilt.

   On a page:
     <span data-void-areas-menu></span>      the hamburger button goes here (in the header)
     <div data-void-areas-ad></div>          one small card for another area goes here
     <script src=".../areas.js" defer data-here="play" data-ad-into="#rows" data-ad-at="3"></script>
       data-here       which area this page is (else worked out from the address)
       data-site       "main" when the page is on voidtv.net itself (else worked out from the address)
       data-ad-into/at  also put a card after that many children of that box, whenever the box is filled again
       data-ads="off"  the menu only, no card (University: Open Yale's terms say no ads there)

   Rules: Void Cast is never here (Bryan's private viewer). Kids (kids.voidtv.net) never loads this file: its links to the
   other areas sit behind the grown-up check (its profile's portals), and no card is ever shown to a child. Only live areas
   are listed: set live: true when an area opens. Copy says shows and movies, free, no account, no ads sold. */
(function () {
  'use strict';
  if (window.VoidAreas) return;

  // id, menu name, one line for the menu, where it lives (main = voidtv.net), the card's words and picture.
  var MAIN = 'https://voidtv.net';
  var AREAS = [
    { id: 'ondemand', name: 'On Demand', line: 'Shows and movies, free', site: 'main', path: '/', live: true,
      kicker: 'Shows and movies', head: 'Shows and movies, free.', text: 'Pick a show, start an episode. Free, no account, no ads sold.',
      go: 'Browse shows', pic: '/assets/brand/bg/wall-m.jpg' },
    { id: 'live', name: 'Live TV', line: 'Channels, always on', site: 'main', path: '/tv', live: true,
      kicker: 'Live TV', head: 'Turn it on. Something good is on.', text: 'Channels that play all day, with a guide like real TV. Free, no account.',
      go: 'Watch live', pic: '/assets/brand/bg/watcher-purple-m.jpg' },
    { id: 'play', name: 'PLAY', line: 'Old games, free to play', site: 'main', path: '/play/', live: true,
      kicker: 'Games', head: 'Old games, free to play.', text: 'Arcade and computer games from the Internet Archive, right in your browser. Your phone can be the controller.',
      go: 'Play now', pic: '/assets/brand/bg/voidarcade-wall-m.webp' },
    { id: 'trivia', name: 'Trivia Night', line: 'Play along on the big screen', site: 'main', path: '/trivia/', live: true,
      kicker: 'Trivia', head: 'Trivia night at home.', text: 'Questions on the TV, answers on your phones. Play with the whole room.',
      go: 'Start trivia', pic: '/assets/brand/bg/trivianight-m.webp' },
    { id: 'university', name: 'Void University', line: 'Big ideas, shown with everyday things', site: 'university', url: 'https://university.voidtv.net/', live: true,
      kicker: 'Learning', head: 'Big ideas, shown with everyday things.', text: 'Free courses built from real lectures, with things to try. No account.',
      go: 'Start learning', pic: 'https://university.voidtv.net/img/c-critical-thinking.jpg' },
    { id: 'kids', name: 'voidtv.net kids', line: 'Shows and games for children', site: 'kids', url: 'https://kids.voidtv.net/', live: true,
      kicker: 'For children', head: 'Cartoons you grew up with. Shows that teach.', text: 'Picked by people, with computer games too. Nothing to sign up for.',
      go: 'Open kids', pic: 'https://kids.voidtv.net/assets/kids/mark.svg', picFit: 'contain' },
    { id: 'hindi', name: 'voidtv.net hindi', line: 'हिंदी में फ़िल्में और शो', site: 'hindi', url: 'https://hindi.voidtv.net/', live: true,
      kicker: 'हिंदी', head: 'हिंदी में फ़िल्में और शो', text: 'Hindi films and shows, Hindi dubs and Live TV. Free, with an English switch.',
      go: 'Open hindi', pic: '/assets/brand/bg/sign-orange-m.jpg' },
    // Outside voidtv.net (Bryan, 21 Nov 2026, "yes" to the whole-house plan's question 5: Read joins the house as one line,
    // linking lexROM where it is). Its card does not say "Also on voidtv.net" (also).
    { id: 'read', name: 'lexROM', line: 'Books read one word at a time', site: 'lexrom', url: 'https://lexrom.bspokevisuals.com/', live: true,
      also: 'Also free', kicker: 'Reading', head: 'Read a book one word at a time.', text: 'Free classics, your own books and the news, on the breath. No account.',
      go: 'Open lexROM', pic: 'https://lexrom.bspokevisuals.com/icon-512.png', picFit: 'contain' },
    // Not open yet: they join the menu and the cards the day live turns true.
    { id: 'westside', name: 'voidtv.net west side', line: 'Films and shows from West Africa', site: 'westside', url: 'https://westside.voidtv.net/', live: false,
      kicker: 'West Africa', head: 'Films and shows from Ghana and Nigeria.', text: 'Kumawood, Ghallywood and Nollywood, free, no account.',
      go: 'Open west side', pic: '/assets/brand/bg/sign-pink-m.jpg' }
  ];

  var me = document.currentScript;
  var opt = function (k) { return me && me.getAttribute('data-' + k); };
  var host = location.hostname;
  var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  // main = voidtv.net itself (and its Pages previews, and a local build); a *.voidtv.net site is the first part of its
  // address; any other address (lexROM) is "other", so voidtv.net's links stay whole and nothing is marked unless the page
  // says data-here.
  var site = opt('site') || (host === 'voidtv.net' || host === 'www.voidtv.net' || /\.voidtvsite\.pages\.dev$/.test(host) || local ? 'main'
    : (/\.voidtv\.net$/.test(host) ? host.split('.')[0] : 'other'));
  var onMain = site === 'main';
  var root = onMain ? '' : MAIN;                  // pictures and voidtv.net paths, from here
  var hereId = function () {
    var h = opt('here'); if (h) return h;
    if (!onMain) return site;
    var p = location.pathname;
    if (/^\/play(\/|$)/.test(p)) return 'play';
    if (/^\/trivia(\/|$)/.test(p)) return 'trivia';
    if (/^\/tv(\/|$)/.test(p)) return 'live';
    return 'ondemand';
  };
  var href = function (a) { return a.site === 'main' ? root + a.path : a.url; };
  var pic = function (a) { return /^https?:/.test(a.pic) ? a.pic : root + a.pic; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var live = AREAS.filter(function (a) { return a.live; });

  var CSS = ''
    + '.va-burger{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:none;padding:0;margin:0;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.04);color:#e8e6f0;cursor:pointer}'
    + '.va-burger:hover,.va-burger:focus-visible{border-color:#ff4fc8;color:#fff;outline:none}'
    + '.va-burger svg{width:20px;height:20px;display:block}'
    // The drawer's own layer: some sites lift every top-level box (University: position relative, z-index 1 under a sticky header).
    + '.va-wrap{position:fixed!important;inset:0;z-index:2147483000!important;display:block}.va-wrap[hidden]{display:none!important}'
    + '.va-shade{position:fixed;inset:0;z-index:2147483000;background:rgba(3,3,8,.6);opacity:0;transition:opacity .2s}'
    + '.va-drawer{position:fixed;top:0;left:0;bottom:0;z-index:2147483001;width:min(340px,86vw);overflow-y:auto;background:#0d0d15;border-right:1px solid #ff4fc8;box-shadow:12px 0 40px rgba(0,0,0,.6),0 0 40px -10px rgba(255,79,200,.35);transform:translateX(-102%);transition:transform .22s ease;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#dcd8e8;padding:16px 16px 24px;box-sizing:border-box}'
    + '.va-open .va-shade{opacity:1}.va-open .va-drawer{transform:none}'
    + '@media (prefers-reduced-motion:reduce){.va-shade,.va-drawer{transition:none}}'
    + '.va-top{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px}'
    + '.va-wm{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:18px;letter-spacing:0;color:#ff4fc8}.va-wm i{font-style:normal;color:#5fe3ff}'
    + '.va-x{width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:#cfcbe0;font-size:24px;line-height:1;cursor:pointer}.va-x:hover,.va-x:focus-visible{background:rgba(255,255,255,.08);color:#fff;outline:none}'
    + '.va-k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9f9bb3;margin:10px 0 4px}'
    + '.va-list{list-style:none;margin:0;padding:0}'
    + '.va-list a{display:block;padding:10px 10px;margin:2px -10px;border-radius:10px;color:#dcd8e8;text-decoration:none}'
    + '.va-list a b{display:block;color:#fff;font-weight:600;font-size:16px}.va-list a span{color:#a9a5bd;font-size:13.5px}'
    + '.va-list a:hover,.va-list a:focus-visible{background:rgba(255,79,200,.12);outline:none}'
    + '.va-list a[aria-current]{background:rgba(95,227,255,.08)}.va-list a[aria-current] b:after{content:"  You are here";color:#5fe3ff;font-weight:400;font-size:12px}'
    + '.va-foot{margin-top:14px;padding-top:12px;border-top:1px solid #23212f;color:#9f9bb3;font-size:13px}'
    + '.va-ad{display:flex;gap:14px;align-items:center;max-width:760px;margin:22px 20px;padding:12px;border-radius:14px;background:linear-gradient(#0b0b12,#0b0b12) padding-box,linear-gradient(135deg,#ff4fc8,#5fe3ff 55%,#7b2cff) border-box;border:1.5px solid transparent;box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 40px -16px rgba(255,79,200,.45);color:#dcd8e8;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none;box-sizing:border-box}'
    + '.va-ad .va-pic{flex:none;width:150px;height:96px;border-radius:9px;overflow:hidden;background:#1a1626}'
    + '.va-ad .va-pic img{width:100%;height:100%;object-fit:cover;display:block}.va-ad .va-pic.fit img{object-fit:contain;padding:10px;box-sizing:border-box;background:#fff6d8}'
    + '.va-ad .va-fk{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#a9a5bd}'
    + '.va-ad .va-h{display:block;color:#fff;font-weight:700;font-size:17px;margin:2px 0}'
    + '.va-ad .va-t{display:block;color:#cfcbe0;font-size:14px}'
    + '.va-ad .va-go{display:inline-block;margin-top:8px;padding:6px 14px;border-radius:999px;background:#ff4fc8;color:#07080c;font-weight:700;font-size:14px}'
    + '.va-ad:hover .va-go,.va-ad:focus-visible .va-go{background:#5fe3ff}.va-ad:focus-visible{outline:2px solid #5fe3ff;outline-offset:3px}'
    + '@media (max-width:560px){.va-ad{margin:18px 12px;gap:12px;padding:10px}.va-ad .va-pic{width:96px;height:72px}.va-ad .va-h{font-size:15.5px}.va-ad .va-t{font-size:13px}}';

  function style() {
    if (document.getElementById('va-css')) return;
    var s = document.createElement('style'); s.id = 'va-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---- the hamburger and its drawer (the drawer sits on <body>: a header with backdrop-filter would trap a fixed box; a div
  // with role navigation, not a <nav>, so a site's own nav styles, like University's sticky sidebar, never reach it)
  var wrap = null, lastFocus = null;
  function drawer() {
    if (wrap) return wrap;
    wrap = document.createElement('div'); wrap.className = 'va-wrap'; wrap.hidden = true;
    wrap.innerHTML = '<div class="va-shade" data-va-close></div><div class="va-drawer" id="va-drawer" role="navigation" aria-label="Every voidtv.net area" tabindex="-1">'
      + '<div class="va-top"><span class="va-wm">voidtv<i>.net</i></span><button type="button" class="va-x" data-va-close aria-label="Close the menu">&times;</button></div>'
      + '<div class="va-k">Every area</div><ul class="va-list"></ul>'
      + '<p class="va-foot">All free. No account. No ads sold.</p></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-va-close]')) close(); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = wrap.querySelectorAll('a,button'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return wrap;
  }
  function fillList() {
    var here = hereId();
    wrap.querySelector('.va-list').innerHTML = live.map(function (a) {
      return '<li><a href="' + esc(href(a)) + '"' + (a.id === here ? ' aria-current="page"' : '') + ' data-va="' + a.id + '"><b>' + esc(a.name) + '</b><span>' + esc(a.line) + '</span></a></li>';
    }).join('');
  }
  function open() {
    drawer(); fillList(); lastFocus = document.activeElement;
    wrap.hidden = false;
    void wrap.offsetWidth;                         // lay it out closed first, so it slides (frames pause in a background tab)
    document.documentElement.classList.add('va-open'); wrap.classList.add('va-open');
    setButtons(true);
    var cur = wrap.querySelector('a[aria-current]') || wrap.querySelector('.va-list a');
    setTimeout(function () { (cur || wrap.querySelector('.va-drawer')).focus({ preventScroll: true }); }, 30);
  }
  function close() {
    if (!wrap || wrap.hidden) return;
    wrap.classList.remove('va-open'); document.documentElement.classList.remove('va-open'); setButtons(false);
    var done = function () { if (!wrap.classList.contains('va-open')) wrap.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 230);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function setButtons(on) {
    document.querySelectorAll('.va-burger').forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  }
  var BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  function menus() {
    document.querySelectorAll('[data-void-areas-menu]:not([data-va-done])').forEach(function (slot) {
      slot.setAttribute('data-va-done', '');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'va-burger'; b.innerHTML = BURGER;
      b.setAttribute('aria-label', 'Every voidtv.net area'); b.setAttribute('title', 'Every voidtv.net area');
      b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'va-drawer');
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(); });
      slot.replaceWith(b);
    });
  }

  // ---- the small card: one other area, the next one on each visit (an even turn through them, not a random pick)
  var turn = (function () {
    var n = 0;
    try { n = (parseInt(localStorage.getItem('va-turn'), 10) || 0) + 1; localStorage.setItem('va-turn', String(n)); }
    catch (e) { n = Math.floor(Math.random() * 1000); }
    return n;
  })();
  function pick(skip) {
    var here = hereId();
    var others = live.filter(function (a) { return a.id !== here && skip.indexOf(a.id) < 0; });
    return others.length ? others[turn % others.length] : null;
  }
  function card(a) {
    var el = document.createElement('a');
    el.className = 'va-ad'; el.href = href(a); el.setAttribute('data-va', a.id);
    el.setAttribute('aria-label', a.name + ': ' + a.head + ' ' + a.text);
    el.innerHTML = '<span class="va-pic' + (a.picFit === 'contain' ? ' fit' : '') + '"><img src="' + esc(pic(a)) + '" alt="" loading="lazy" decoding="async"></span>'
      + '<span class="va-b"><span class="va-fk">' + esc(a.also || 'Also on voidtv.net') + ' &middot; ' + esc(a.kicker) + '</span><span class="va-h">' + esc(a.head) + '</span>'
      + '<span class="va-t">' + esc(a.text) + '</span><span class="va-go">&#9654; ' + esc(a.go) + '</span></span>';
    return el;
  }
  var adsOff = opt('ads') === 'off';
  function ads() {
    if (adsOff) return;
    var shown = [];
    document.querySelectorAll('[data-void-areas-ad]').forEach(function (slot) {
      if (slot.firstChild) { shown.push(slot.firstChild.getAttribute('data-va')); return; }
      var a = pick(shown); if (!a) return;
      shown.push(a.id); slot.appendChild(card(a));
    });
    var into = opt('ad-into'), at = parseInt(opt('ad-at'), 10) || 2;
    var box = into && document.querySelector(into);
    if (box && !box.querySelector(':scope > [data-va-slot]') && box.children.length > at) {
      var a = pick(shown); if (!a) return;
      var s = document.createElement('div'); s.setAttribute('data-va-slot', ''); s.setAttribute('data-void-areas-ad', '');
      s.appendChild(card(a));
      box.insertBefore(s, box.children[at]);
    }
  }

  var queued = false;
  function run() { queued = false; menus(); ads(); }
  function later() { if (!queued) { queued = true; setTimeout(run, 60); } }
  function start() {
    style(); run();
    // Pages that draw themselves (voidtv.net's app, PLAY's rows) put new slots in later: fill them as they come.
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  }
  window.VoidAreas = { areas: AREAS, open: open, close: close, refresh: run };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
