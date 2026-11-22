/* One background for every voidtv.net area (Bryan, 21 Nov 2026: "the bgs on all the voids isnt to the level it needs to be.
   its not the correct opacity nor does it feels like it sits behind at a distance with the infinite detached paralax type or
   whatever scrolling"; 22 Nov 2026: "i want the bg sittuation to be fixed on all pages").

   Before this file the layer was built five times (the main site, PLAY, both Trivia pages, University), each a little
   different: glued to the page on PLAY, switched off on the home page whenever a video played, pinned and faint on show
   pages and Trivia, and running out before the end of a long page (audit/polish-2026-11-22/findings-bg.md). Now there is
   one, and a fix here reaches every area.

   What it draws, all inside one box fixed to the window, behind the page:
     far    the area's own pictures, stacked and soft, moving at a share of the scroll: far things move slowly
     mid    VoidTV's lightning static, see-through, over the pictures (at its own speed, if the numbers give it one)
     near   dust, faster
     veil   one still dark wash, so the words in front keep their contrast
     void   VoidTV's slow void, bottom right
     grain  film grain over the whole page
   Each moving layer is a strip a little taller than its own pattern, moved by transform only and wrapped round when it has
   gone one pattern's length, so it never ends on a page of any length and never needs the page's height. Each also drifts
   a little by itself, so it reads as detached from the page. Nothing here reads layout while the page scrolls.

   On a page (voidtv.net, PLAY and Trivia by path; a site on its own address by https://voidtv.net/...):
     <script src="/assets/brand/atmos/atmos.js" data-far="col/wall.jpg,col/sign-pink.jpg"></script>
       data-far       the area's pictures, in turn down the strip. A name is read from /assets/brand/bg/ beside this file,
                      or from data-base when the area keeps its own pictures. "wall.jpg" has a phone copy "wall-m.jpg".
       data-mid       the see-through pictures (left out: VoidTV's three lightning statics)
       data-fit       "cover": a tile is never shorter than the window (one picture, as on Trivia). Left out: a tile has the
                      picture's own shape, so the whole picture shows (PLAY, Bryan on the zoomed-out mock: "use it like that")
       data-strength  1 is the house strength; an area that needs a quieter background asks for less
       data-void      "off" for no void
       data-start     which picture comes first
   A page that changes its view without loading again (the main site) calls VoidAtmos.set({ start: 2, void: false }).
   A page that must not show it for some look hides .vatm in its own style (University's daylight look).

   Phones (700 px wide or less) and anyone who asks for less motion get the same picture, standing still. Tablets move
   (Bryan, 19 Nov 2026: "make the background drift on my tablet too"). While the site's player plays, the page still moves
   against the background; only the grain and the idle drift rest, so the video keeps its frames.

   To tune by eye: add ?atmos=tune to any page. The numbers stay in that browser until Reset. */
(function () {
  'use strict';

  // ---- The rules, with no page in them (tests/atmos.test.js) ----
  var RATIO = 1072 / 1920;   // every background picture is this shape
  // o = how strong (0 to 1), s = share of the page's scroll (the page itself is 1).
  // These are Bryan's own numbers, set by eye with the tuning box on 22 Nov 2026 and pasted to Claude. The pictures and the
  // lightning move together at his setting; the dust runs ahead of them.
  var HOUSE = { far: { o: 0.58, s: 0.22 }, mid: { o: 0.37, s: 0.22 }, near: { o: 0.43, s: 0.66 }, veilTop: 0.25, veilBottom: 0.43, grain: 0.05, void: 0.16 };
  var MID = ['col/static-glitch.jpg', 'col/static-bolt.jpg', 'col/static-dark.jpg'];
  var DUST = 1024;           // the dust pattern's size, px: large, so the eye does not find the repeat

  function isPhone(W) { return W <= 700; }
  // How tall one tile is. A picture's own shape; on a phone the phone copy, taller; "cover" never shorter than the window.
  function tileHeight(W, VH, fit) { var t = Math.round(W * (isPhone(W) ? 1.25 : RATIO)); return fit === 'cover' ? Math.max(t, Math.round(VH)) : t; }
  // How many tiles a strip needs below its top: one whole pattern and one window, and one more so the drift never shows an edge.
  function tileCount(T, n, VH) { return Math.ceil((n * T + VH) / T) + 1; }
  // Where a strip sits for a scroll position: always between one pattern's length up and 0, the same picture at both ends.
  function shift(y, speed, period, start) { var p = ((y * speed + (start || 0)) % period + period) % period; return -p; }
  function clamp(v, a, b) { v = +v; return v !== v ? a : Math.min(b, Math.max(a, v)); }
  // A picture's address: a full address or a path from the site's root as given, else beside the base; the phone copy on a phone.
  function address(name, base, phone) {
    var n = String(name).trim(); if (!n) return '';
    if (phone) n = n.replace(/(\.[a-z0-9]+)$/i, '-m$1');
    return /^(https?:)?\/\//.test(n) || n.charAt(0) === '/' ? n : base + n;
  }
  function settings(tuned) {
    var S = JSON.parse(JSON.stringify(HOUSE)), t = tuned || {};
    ['far', 'mid', 'near'].forEach(function (k) { if (t[k]) { if (t[k].o != null) S[k].o = clamp(t[k].o, 0, 1); if (t[k].s != null) S[k].s = clamp(t[k].s, 0, 0.9); } });
    ['veilTop', 'veilBottom', 'void'].forEach(function (k) { if (t[k] != null) S[k] = clamp(t[k], 0, 1); });
    if (t.grain != null) S.grain = clamp(t.grain, 0, 0.3);
    return S;
  }
  var API = { HOUSE: HOUSE, RATIO: RATIO, DUST: DUST, tileHeight: tileHeight, tileCount: tileCount, shift: shift, address: address, settings: settings, isPhone: isPhone };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.VoidAtmos) return;

  // ---- This page's settings ----
  var me = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="atmos/atmos.js"]'); return s[s.length - 1]; })();
  var d = (me && me.dataset) || {};
  var HOME = me && me.src ? me.src.replace(/atmos\/atmos\.js.*$/, '') : '/assets/brand/';   // .../assets/brand/
  var opt = {
    far: (d.far || 'col/wall.jpg,col/sign-pink.jpg,col/watcher-purple.jpg,col/sign-orange.jpg,col/watcher-orange.jpg').split(',').filter(Boolean),
    mid: d.mid ? d.mid.split(',').filter(Boolean) : null,
    base: d.base || HOME + 'bg/',
    fit: d.fit === 'cover' ? 'cover' : 'whole',
    strength: clamp(d.strength == null ? 1 : d.strength, 0, 1.6),
    void: d.void !== 'off',
    start: Math.max(0, parseInt(d.start, 10) || 0)
  };
  var KEY = 'void.atmos.tune';
  function readTuned() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  var S = settings(readTuned());
  var lessMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- The style, written once ----
  var css = ''
    + '.vatm{position:fixed;inset:0;overflow:hidden;pointer-events:none;contain:strict}.vatm.lo{z-index:0;background:#07080c}.vatm.hi{z-index:1000}'
    + '.vatm-s{position:absolute;left:0;top:0;width:100%;will-change:transform}'
    // The drifting part is a little wider than the window, so a sideways drift never shows an edge.
    + '.vatm-d{position:absolute;left:-32px;right:-32px;top:0;will-change:transform}'
    + '.vatm-s{opacity:0;transition:opacity .9s ease}.vatm.on .vatm-s{opacity:1}'
    + '.vatm-s i{position:absolute;left:0;width:100%;display:block;background:center/cover no-repeat}'
    // The far pictures melt into the dark at each join; the lightning is feathered wide, so it floats.
    + '.vatm-far i{-webkit-mask:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent)}'
    + '.vatm-mid{mix-blend-mode:screen}.vatm-mid i{-webkit-mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent)}'
    + '.vatm-near i{background-repeat:repeat;background-size:' + DUST + 'px ' + DUST + 'px;background-position:0 0}'
    + '.vatm-veil{position:absolute;inset:0}'
    + '.vatm-void{position:absolute;right:-18vw;bottom:-22vw;width:64vw;height:64vw;max-width:900px;max-height:900px;will-change:transform}'
    + '.vatm-void i{position:absolute;inset:0;display:block;background:url(' + HOME + 'void-soft.webp) center/contain no-repeat;animation:vatm-spin 240s linear infinite}'
    + '.vatm-grain{position:absolute;left:-50%;top:-50%;width:200%;height:200%;background-repeat:repeat;background-size:160px 160px;animation:vatm-grain .6s steps(6) infinite;will-change:transform}'
    + '.vatm-far .vatm-d{animation:vatm-a 118s ease-in-out infinite alternate}.vatm-mid .vatm-d{animation:vatm-b 143s ease-in-out infinite alternate}.vatm-near .vatm-d{animation:vatm-c 91s ease-in-out infinite alternate}'
    + '@keyframes vatm-a{from{transform:translate3d(-12px,-14px,0)}to{transform:translate3d(12px,14px,0)}}'
    + '@keyframes vatm-b{from{transform:translate3d(20px,18px,0)}to{transform:translate3d(-20px,-18px,0)}}'
    + '@keyframes vatm-c{from{transform:translate3d(-26px,12px,0)}to{transform:translate3d(26px,-20px,0)}}'
    + '@keyframes vatm-spin{to{transform:rotate(360deg)}}'
    + '@keyframes vatm-grain{0%{transform:translate(0,0)}20%{transform:translate(-4%,-8%)}40%{transform:translate(-12%,4%)}60%{transform:translate(6%,-18%)}80%{transform:translate(-4%,18%)}100%{transform:translate(9%,0)}}'
    // Rest: a hidden tab, the site's player playing, a phone, less motion.
    + '.vatm.rest .vatm-d,.vatm.rest .vatm-void i,.vatm.rest .vatm-grain,html.vp-playing .vatm-d,html.vp-playing .vatm-void i{animation-play-state:paused}'
    + 'html.vp-playing .vatm-grain{display:none}'
    + '.vatm.still .vatm-d,.vatm.still .vatm-void i,.vatm.still .vatm-grain{animation:none}.vatm.still .vatm-grain{left:0;top:0;width:100%;height:100%}'
    + '@media (prefers-reduced-motion:reduce){.vatm-d,.vatm-void i,.vatm-grain{animation:none!important}}'
    + '@media print{.vatm{display:none}}';
  var st = document.createElement('style'); st.id = 'vatm-style'; st.textContent = css; document.head.appendChild(st);

  // ---- The dust and the grain: small see-through patterns drawn once, so nothing is blended while the page moves ----
  function pattern(size, draw) {
    try { var c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return 'url(' + c.toDataURL('image/png') + ')'; } catch (e) { return 'none'; }
  }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var DUSTPIC = pattern(DUST, function (g, n) {
    var r = rnd(7), tints = ['95,212,255', '242,169,59', '255,255,255', '63,207,90', '95,212,255', '255,255,255'];
    for (var i = 0; i < 120; i++) {
      var x = r() * n, y = r() * n, big = r() < 0.07, rad = big ? 1.6 + r() * 1.2 : 0.7 + r() * 0.6, a = big ? 0.5 + r() * 0.3 : 0.25 + r() * 0.35, c = tints[i % tints.length];
      if (big) { var halo = g.createRadialGradient(x, y, 0, x, y, rad * 5); halo.addColorStop(0, 'rgba(' + c + ',' + (a * 0.35) + ')'); halo.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = halo; g.beginPath(); g.arc(x, y, rad * 5, 0, 6.2832); g.fill(); }
      g.fillStyle = 'rgba(' + c + ',' + a + ')'; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
    }
  });
  var GRAINPIC = pattern(160, function (g, n) {
    var im = g.createImageData(n, n), r = rnd(31), p = im.data;
    for (var i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = Math.floor(r() * r() * 255); }
    g.putImageData(im, 0, 0);
  });

  // ---- The boxes ----
  function el(cls, parent) { var e = document.createElement('div'); e.className = cls; if (parent) parent.appendChild(e); return e; }
  var lo = el('vatm lo'), hi = el('vatm hi');
  lo.setAttribute('aria-hidden', 'true'); hi.setAttribute('aria-hidden', 'true');
  var far = el('vatm-s vatm-far', lo), farD = el('vatm-d', far);
  var mid = el('vatm-s vatm-mid', lo), midD = el('vatm-d', mid);
  var near = el('vatm-s vatm-near', lo), nearD = el('vatm-d', near);
  var vd = el('vatm-void', lo); vd.appendChild(document.createElement('i'));
  var veil = el('vatm-veil', lo);
  var grain = el('vatm-grain', hi); grain.style.backgroundImage = GRAINPIC;

  var G = { W: 0, VH: 0, T: 0, Pf: 1, Pm: 1, still: false };
  function tiles(names, T, count, from) {
    var h = '', phone = isPhone(G.W), n = names.length;
    for (var i = -1; i < count; i++) h += '<i style="top:' + (i * T) + 'px;height:' + T + 'px;background-image:url(' + address(names[((i + from) % n + n) % n], names === opt.far ? opt.base : (opt.mid ? opt.base : HOME + 'bg/'), phone) + ')"></i>';
    return h;
  }
  function build() {
    var W = window.innerWidth, VH = window.innerHeight;
    G.W = W; G.VH = VH; G.still = lessMotion || isPhone(W);
    var T = G.T = tileHeight(W, VH, opt.fit), mids = opt.mid || MID;
    G.Pf = opt.far.length * T; G.Pm = mids.length * T;
    farD.innerHTML = tiles(opt.far, T, tileCount(T, opt.far.length, VH), opt.start);
    // The lightning starts half a tile down, so at the top of a page it lies over the first join.
    midD.innerHTML = tiles(mids, T, tileCount(T, mids.length, VH) + 1, 0); midD.style.top = (-Math.round(T / 2)) + 'px';
    nearD.innerHTML = '<i style="top:' + (-DUST) + 'px;height:' + (VH + 3 * DUST) + 'px;background-image:' + DUSTPIC + '"></i>';
    lo.classList.toggle('still', G.still); hi.classList.toggle('still', G.still);
    paint(); frame();
  }
  function paint() {
    var k = opt.strength;
    farD.style.opacity = clamp(S.far.o * k, 0, 1); midD.style.opacity = clamp(S.mid.o * k, 0, 1); nearD.style.opacity = clamp(S.near.o, 0, 1);
    veil.style.background = 'linear-gradient(180deg,rgba(7,8,12,' + S.veilTop + ') 0%,rgba(7,8,12,' + S.veilBottom + ') 100%)';
    vd.style.display = opt.void && S.void > 0 ? '' : 'none'; vd.style.opacity = S.void;
    grain.style.opacity = S.grain;
  }

  // ---- Moving: one frame for a scroll, three transforms, nothing read from the layout ----
  var queued = false;
  function frame() {
    queued = false;
    var y = G.still ? 0 : (window.scrollY || 0);
    far.style.transform = 'translate3d(0,' + shift(y, S.far.s, G.Pf, 0).toFixed(1) + 'px,0)';
    mid.style.transform = 'translate3d(0,' + shift(y, S.mid.s, G.Pm, 0).toFixed(1) + 'px,0)';
    near.style.transform = 'translate3d(0,' + shift(y, S.near.s, DUST, 0).toFixed(1) + 'px,0)';
    if (opt.void) vd.style.transform = G.still ? '' : 'translate3d(' + (Math.sin(y / 430) * 60).toFixed(1) + 'px,' + (Math.sin(y / 700) * 90).toFixed(1) + 'px,0) rotate(' + (y * 0.06).toFixed(2) + 'deg)';
  }
  function onScroll() { if (!queued && !G.still) { queued = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  var rz = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    // A phone's address bar sliding away changes the height a little: not worth a rebuild.
    rz = setTimeout(function () { if (window.innerWidth !== G.W || Math.abs(window.innerHeight - G.VH) > 120) build(); }, 150);
  });
  document.addEventListener('visibilitychange', function () { lo.classList.toggle('rest', document.hidden); hi.classList.toggle('rest', document.hidden); });

  // ---- The site's player playing: the grain and the drift rest (html.vp-playing; the main site's style uses it too) ----
  var watch = 0;
  function playing() {
    var on = !!document.querySelector('.vpx:not(.paused)');
    document.documentElement.classList.toggle('vp-playing', on);
    if (on && !watch) watch = setInterval(playing, 1000);          // a player taken off the page sends no pause
    if (!on && watch) { clearInterval(watch); watch = 0; }
  }
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (e) { document.addEventListener(e, function () { setTimeout(playing, 0); }, true); });

  // ---- On the page ----
  function mount() {
    if (lo.parentNode) return;
    document.body.insertBefore(lo, document.body.firstChild); document.body.appendChild(hi);
    build(); playing();
    requestAnimationFrame(function () { requestAnimationFrame(function () { lo.classList.add('on'); }); });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.VoidAtmos = {
    // A new view of the same page: other pictures, another first picture, the void on or off.
    set: function (o) {
      o = o || {}; var again = false;
      if (o.far && o.far.join() !== opt.far.join()) { opt.far = o.far.slice(); again = true; }
      if (o.start != null && (parseInt(o.start, 10) || 0) !== opt.start) { opt.start = Math.max(0, parseInt(o.start, 10) || 0); again = true; }
      if (o.fit && o.fit !== opt.fit) { opt.fit = o.fit === 'cover' ? 'cover' : 'whole'; again = true; }
      if (o.strength != null) opt.strength = clamp(o.strength, 0, 1.6);
      if (o.void != null) opt.void = !!o.void;
      if (again && lo.parentNode) build(); else paint();
    },
    tune: function (t) { S = settings(t); paint(); frame(); },
    numbers: function () { return JSON.parse(JSON.stringify(S)); },
    rules: API
  };

  // ---- Tuning by eye (?atmos=tune): Bryan sets the numbers on his own screen; they stay in this browser until Reset ----
  if (/[?&]atmos=tune\b/.test(location.search)) (function () {
    var rows = [
      ['far.o', 'Pictures: strength', 0, 1, 'How strongly the area\'s own pictures show'],
      ['far.s', 'Pictures: speed', 0, 0.6, 'How much of the page\'s scroll the pictures follow. Lower looks farther away'],
      ['mid.o', 'Lightning: strength', 0, 1, 'How strongly the lightning static shows over the pictures'],
      ['mid.s', 'Lightning: speed', 0, 0.8, 'How much of the scroll the lightning follows'],
      ['near.o', 'Dust: strength', 0, 1, 'How strongly the dust shows'],
      ['near.s', 'Dust: speed', 0, 0.9, 'How much of the scroll the dust follows. Higher looks nearer'],
      ['veilTop', 'Dark wash: top', 0, 1, 'How dark the wash is at the top of the window'],
      ['veilBottom', 'Dark wash: bottom', 0, 1, 'How dark the wash is at the bottom of the window'],
      ['grain', 'Film grain', 0, 0.3, 'How strong the film grain is over the whole page'],
      ['void', 'Void', 0, 0.5, 'How strongly the slow void shows at the bottom right']
    ];
    function get(k) { var p = k.split('.'); return p.length > 1 ? S[p[0]][p[1]] : S[k]; }
    function put(k, v) { var p = k.split('.'); if (p.length > 1) S[p[0]][p[1]] = v; else S[k] = v; }
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;width:292px;max-height:calc(100vh - 20px);overflow:auto;padding:10px 12px 12px;background:rgba(7,8,12,.94);color:#e9ebf3;border:1px solid #3a3f55;border-radius:10px;font:13px/1.35 system-ui,sans-serif';
    var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="flex:1">Background</b>'
      + '<button type="button" data-a="hide" title="Close this box. Your numbers stay; open it again with ?atmos=tune">&#x2715;</button></div>';
    rows.forEach(function (r) {
      h += '<label title="' + r[4] + '" style="display:grid;grid-template-columns:118px 1fr 40px;align-items:center;gap:6px;margin:3px 0"><span>' + r[1] + '</span>'
        + '<input type="range" data-k="' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" step="0.01" value="' + get(r[0]) + '" title="' + r[4] + '"><output>' + (+get(r[0])).toFixed(2) + '</output></label>';
    });
    h += '<div style="display:flex;gap:6px;margin-top:8px"><button type="button" data-a="copy" title="Copy these numbers, to send to Claude so they become the setting for everyone">Copy numbers</button>'
      + '<button type="button" data-a="reset" title="Go back to the numbers every visitor has now">Reset</button></div><div data-say style="margin-top:6px;color:#a6abc0;min-height:1.3em"></div>';
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.style.cssText = 'font:inherit;color:inherit;background:#1c1f2b;border:1px solid #3a3f55;border-radius:6px;padding:4px 9px;cursor:pointer'; });
    var say = box.querySelector('[data-say]');
    function keep() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    box.addEventListener('input', function (e) {
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      put(k, +e.target.value); e.target.nextElementSibling.textContent = (+e.target.value).toFixed(2); paint(); frame(); keep(); say.textContent = '';
    });
    box.addEventListener('click', function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'hide') box.remove();
      if (a === 'reset') { try { localStorage.removeItem(KEY); } catch (x) {} S = settings(null); paint(); frame(); Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { i.value = get(i.dataset.k); i.nextElementSibling.textContent = (+i.value).toFixed(2); }); say.textContent = 'Back to the numbers everyone has.'; }
      if (a === 'copy') { var t = JSON.stringify(S); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { say.textContent = 'Copied. Paste it to Claude.'; }, function () { say.textContent = t; }); }
    });
    (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); })).then(function () { document.body.appendChild(box); });
  })();
})();
